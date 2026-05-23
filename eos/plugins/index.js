export function register(kernel) {
  if (!kernel || typeof kernel.registerPlugin !== "function") {
    throw new TypeError("kernel must support registerPlugin()");
  }
  return kernel;
}
