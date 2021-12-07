function addAttachment(msg, name, data, contentLength, contentType, sourceUrl, responseType) {
  const emitter = this;
  switch (responseType) {
    case 'arraybuffer':
      break;
    case 'stream':
      break;
    default:
      throw Error('Please set the response type to arraybuffer or stream to handle the binary file attached to the response.');
  }
}
