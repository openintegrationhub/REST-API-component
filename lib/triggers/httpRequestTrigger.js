const { processMethod } = require('../utils.js');

function processTrigger(msg, cfg, snapshot) {
  // eslint-disable-next-line no-param-reassign
  msg.body = {};
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);
  return processMethod.call(this, msg, cfg, snapshot);
}

exports.process = processTrigger;
