const uuid = require('uuid');

function newMessage(data) {
  const msg = {
    id: uuid.v4(),
    attachments: {},
    data,
    headers: {},
    metadata: {},
  };

  return msg;
}

module.exports = {
  newMessage,
};
