const { processMethod } = require("../utils.js");

function processTrigger(msg, cfg) {
  // eslint-disable-next-line no-param-reassign
  msg.body = {};
  console.log("msg:  ", msg);
  console.log("cfg:  ", cfg);
  return processMethod.call(this, msg, cfg);
}

exports.process = processTrigger;
