export function mountBalance(sdk, render, audit) {
  let disposed = false
  const { cancel } = sdk.watch((event) => {
    if (disposed) return
    if (event.type === "waiting") {
      render({ kind: "loading" })
    } else if (event.type === "settled") {
      render({ kind: "ready", text: `$${(event.payload.minorUnits / 100).toFixed(2)}` })
      audit("balance.ready")
    } else if (event.type === "rejected" && event.code === "DENIED") {
      render({ kind: "error", text: "Not allowed" })
    } else if (event.type === "rejected" && event.code === "OFFLINE") {
      render({ kind: "error", text: "Try again" })
    } else {
      throw event.error
    }
  })
  return () => {
    if (disposed) return
    disposed = true
    cancel()
  }
}
