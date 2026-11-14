class Recorder extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0]
    if (channels.length) this.port.postMessage(channels.map((c) => c.slice()))
    return true
  }
}
registerProcessor('twoway-recorder', Recorder)
