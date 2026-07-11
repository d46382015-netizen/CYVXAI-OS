// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IAavePoolMinimal {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IAaveFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address recipient,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

contract FlashArb is IAaveFlashLoanSimpleReceiver {
    enum DexKind {
        V2,
        V3
    }

    enum ExecutionState {
        Idle,
        LoanRequested,
        Callback
    }

    struct Leg {
        DexKind kind;
        address router;
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 minAmountOut;
    }

    struct Route {
        uint256 minProfit;
        uint256 deadline;
        Leg first;
        Leg second;
    }

    error NotOwner();
    error NotOperator();
    error ContractPaused();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidDeadline();
    error InvalidRoute();
    error InvalidCallback();
    error InvalidState();
    error RouterNotAllowed(address router);
    error TokenNotAllowed(address token);
    error TokenCallFailed(address token);
    error InputNotConsumed(uint256 expected, uint256 actual);
    error InsufficientLegOutput(uint256 minimum, uint256 actual);
    error Unprofitable(uint256 requiredBalance, uint256 actualBalance);
    error NativeTransferFailed();

    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event RouterPermissionUpdated(address indexed router, bool allowed);
    event TokenPermissionUpdated(address indexed token, bool allowed);
    event PauseUpdated(bool paused);
    event ArbitrageRequested(
        bytes32 indexed routeHash,
        address indexed asset,
        uint256 amount,
        uint256 minProfit,
        uint256 deadline
    );
    event ArbitrageSettled(
        bytes32 indexed routeHash,
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 realizedProfit
    );
    event TokenWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    uint256 public constant MAX_DEADLINE_WINDOW = 120 seconds;

    IAavePoolMinimal public immutable aavePool;
    address public owner;
    address public pendingOwner;
    address public operator;
    bool public paused;

    mapping(address => bool) public allowedRouters;
    mapping(address => bool) public allowedTokens;

    ExecutionState private executionState;
    bool private callbackCompleted;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    constructor(address pool_, address owner_, address operator_) {
        if (pool_ == address(0) || owner_ == address(0) || operator_ == address(0)) {
            revert ZeroAddress();
        }
        aavePool = IAavePoolMinimal(pool_);
        owner = owner_;
        operator = operator_;
        executionState = ExecutionState.Idle;
        emit OwnershipTransferred(address(0), owner_);
        emit OperatorUpdated(address(0), operator_);
    }

    function executeArbitrage(
        address asset,
        uint256 amount,
        uint256 minProfit,
        uint256 deadline,
        Leg calldata first,
        Leg calldata second
    ) external onlyOperator whenNotPaused {
        if (executionState != ExecutionState.Idle) revert InvalidState();
        if (amount == 0) revert ZeroAmount();

        _validateRoute(asset, deadline, first, second);
        Route memory route = Route({
            minProfit: minProfit,
            deadline: deadline,
            first: first,
            second: second
        });
        bytes memory encodedRoute = abi.encode(route);
        bytes32 routeHash = keccak256(encodedRoute);

        executionState = ExecutionState.LoanRequested;
        callbackCompleted = false;
        emit ArbitrageRequested(routeHash, asset, amount, minProfit, deadline);

        aavePool.flashLoanSimple(address(this), asset, amount, encodedRoute, 0);

        if (!callbackCompleted || executionState != ExecutionState.LoanRequested) {
            revert InvalidState();
        }
        _forceApprove(asset, address(aavePool), 0);
        executionState = ExecutionState.Idle;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        if (
            msg.sender != address(aavePool) || initiator != address(this)
                || executionState != ExecutionState.LoanRequested
        ) {
            revert InvalidCallback();
        }

        executionState = ExecutionState.Callback;
        Route memory route = abi.decode(params, (Route));
        _validateRoute(asset, route.deadline, route.first, route.second);

        uint256 realizedProfit = _executeRouteAndValidate(asset, amount, premium, route);
        _forceApprove(asset, address(aavePool), amount + premium);

        callbackCompleted = true;
        executionState = ExecutionState.LoanRequested;
        emit ArbitrageSettled(keccak256(params), asset, amount, premium, realizedProfit);
        return true;
    }

    function _executeRouteAndValidate(
        address asset,
        uint256 amount,
        uint256 premium,
        Route memory route
    ) internal returns (uint256 realizedProfit) {
        uint256 startingBalance = IERC20Minimal(asset).balanceOf(address(this));
        if (startingBalance < amount) revert InvalidCallback();
        uint256 treasuryBefore = startingBalance - amount;

        uint256 intermediateAmount = _executeLeg(route.first, amount, route.deadline);
        _executeLeg(route.second, intermediateAmount, route.deadline);

        uint256 totalOwed = amount + premium;
        uint256 finalBalance = IERC20Minimal(asset).balanceOf(address(this));
        uint256 requiredBalance = treasuryBefore + totalOwed + route.minProfit;
        if (finalBalance < requiredBalance) {
            revert Unprofitable(requiredBalance, finalBalance);
        }
        realizedProfit = finalBalance - treasuryBefore - totalOwed;
    }

    function _executeLeg(Leg memory leg, uint256 amountIn, uint256 deadline)
        internal
        returns (uint256 amountOut)
    {
        uint256 inputBefore = IERC20Minimal(leg.tokenIn).balanceOf(address(this));
        uint256 outputBefore = IERC20Minimal(leg.tokenOut).balanceOf(address(this));
        _forceApprove(leg.tokenIn, leg.router, amountIn);

        if (leg.kind == DexKind.V2) {
            address[] memory path = new address[](2);
            path[0] = leg.tokenIn;
            path[1] = leg.tokenOut;
            IUniswapV2Router(leg.router).swapExactTokensForTokens(
                amountIn,
                leg.minAmountOut,
                path,
                address(this),
                deadline
            );
        } else {
            IUniswapV3Router(leg.router).exactInputSingle(
                IUniswapV3Router.ExactInputSingleParams({
                    tokenIn: leg.tokenIn,
                    tokenOut: leg.tokenOut,
                    fee: leg.fee,
                    recipient: address(this),
                    deadline: deadline,
                    amountIn: amountIn,
                    amountOutMinimum: leg.minAmountOut,
                    sqrtPriceLimitX96: 0
                })
            );
        }

        _forceApprove(leg.tokenIn, leg.router, 0);
        uint256 inputAfter = IERC20Minimal(leg.tokenIn).balanceOf(address(this));
        uint256 outputAfter = IERC20Minimal(leg.tokenOut).balanceOf(address(this));
        uint256 consumed = inputBefore - inputAfter;
        if (consumed != amountIn) revert InputNotConsumed(amountIn, consumed);

        amountOut = outputAfter - outputBefore;
        if (amountOut < leg.minAmountOut) {
            revert InsufficientLegOutput(leg.minAmountOut, amountOut);
        }
    }

    function _validateRoute(
        address asset,
        uint256 deadline,
        Leg memory first,
        Leg memory second
    ) internal view {
        if (asset == address(0)) revert ZeroAddress();
        if (deadline < block.timestamp || deadline > block.timestamp + MAX_DEADLINE_WINDOW) {
            revert InvalidDeadline();
        }
        if (
            first.router == address(0) || second.router == address(0)
                || first.tokenIn != asset || first.tokenOut != second.tokenIn
                || second.tokenOut != asset || first.tokenIn == first.tokenOut
                || second.tokenIn == second.tokenOut
        ) {
            revert InvalidRoute();
        }
        if (!allowedRouters[first.router]) revert RouterNotAllowed(first.router);
        if (!allowedRouters[second.router]) revert RouterNotAllowed(second.router);
        if (!allowedTokens[first.tokenIn]) revert TokenNotAllowed(first.tokenIn);
        if (!allowedTokens[first.tokenOut]) revert TokenNotAllowed(first.tokenOut);
        if (!allowedTokens[second.tokenIn]) revert TokenNotAllowed(second.tokenIn);
        if (!allowedTokens[second.tokenOut]) revert TokenNotAllowed(second.tokenOut);
    }

    function setRouterAllowed(address router, bool allowed) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        allowedRouters[router] = allowed;
        emit RouterPermissionUpdated(router, allowed);
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedTokens[token] = allowed;
        emit TokenPermissionUpdated(token, allowed);
    }

    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        address previousOperator = operator;
        operator = newOperator;
        emit OperatorUpdated(previousOperator, newOperator);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseUpdated(value);
    }

    function startOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    function withdraw(address token, address recipient, uint256 amount) external onlyOwner {
        if (executionState != ExecutionState.Idle) revert InvalidState();
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        uint256 balance = IERC20Minimal(token).balanceOf(address(this));
        uint256 withdrawalAmount = amount == type(uint256).max ? balance : amount;
        _safeTransfer(token, recipient, withdrawalAmount);
        emit TokenWithdrawn(token, recipient, withdrawalAmount);
    }

    function withdrawNative(address payable recipient, uint256 amount) external onlyOwner {
        if (executionState != ExecutionState.Idle) revert InvalidState();
        if (recipient == address(0)) revert ZeroAddress();
        uint256 withdrawalAmount = amount == type(uint256).max ? address(this).balance : amount;
        (bool success,) = recipient.call{value: withdrawalAmount}("");
        if (!success) revert NativeTransferFailed();
    }

    function currentExecutionState() external view returns (ExecutionState) {
        return executionState;
    }

    function _forceApprove(address token, address spender, uint256 amount) internal {
        _callOptionalReturn(
            token,
            abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, 0)
        );
        if (amount != 0) {
            _callOptionalReturn(
                token,
                abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, amount)
            );
        }
    }

    function _safeTransfer(address token, address recipient, uint256 amount) internal {
        _callOptionalReturn(
            token,
            abi.encodeWithSelector(IERC20Minimal.transfer.selector, recipient, amount)
        );
    }

    function _callOptionalReturn(address token, bytes memory data) internal {
        (bool success, bytes memory returnData) = token.call(data);
        if (!success || (returnData.length != 0 && !abi.decode(returnData, (bool)))) {
            revert TokenCallFailed(token);
        }
    }

    receive() external payable {}
}
