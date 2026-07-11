#!/usr/bin/env python3
import unittest

from quote_engine import decode_uint, decode_uint_array, parse_usdc, slippage
from readonly_rpc import method_blocked


class RuntimePolicyTest(unittest.TestCase):
    def test_required_reads_are_allowed(self) -> None:
        for method in (
            "eth_chainId",
            "eth_blockNumber",
            "eth_getCode",
            "eth_getStorageAt",
            "eth_getProof",
            "eth_call",
            "eth_estimateGas",
            "eth_feeHistory",
            "eth_getBlockByNumber",
            "eth_getTransactionCount",
        ):
            self.assertFalse(method_blocked(method), method)

    def test_writes_signing_and_bundles_are_blocked(self) -> None:
        for method in (
            "eth_sendRawTransaction",
            "eth_sendTransaction",
            "eth_sign",
            "personal_unlockAccount",
            "wallet_addEthereumChain",
            "engine_newPayloadV3",
            "eth_sendBundle",
            "mev_sendBundle",
            "anvil_setBalance",
        ):
            self.assertTrue(method_blocked(method), method)

    def test_abi_decoders_and_units(self) -> None:
        raw_uint = "0x" + (123456).to_bytes(32, "big").hex()
        self.assertEqual(decode_uint(raw_uint), 123456)
        values = [100, 200]
        encoded = (
            (32).to_bytes(32, "big")
            + len(values).to_bytes(32, "big")
            + b"".join(value.to_bytes(32, "big") for value in values)
        )
        self.assertEqual(decode_uint_array("0x" + encoded.hex()), values)
        self.assertEqual(slippage(1_000_000, 15), 998_500)
        self.assertEqual(parse_usdc("1.25"), 1_250_000)


if __name__ == "__main__":
    unittest.main()
