const uuid = require('uuid');

function newMessage(data, attachments) {
  const msg = {
    id: uuid.v4(),
    attachments: attachments || {},
    data,
    headers: {},
    metadata: {},
  };

  return msg;
}

module.exports = {
  newMessage,
};
