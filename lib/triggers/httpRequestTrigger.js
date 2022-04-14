const { processMethod } = require('../utils.js');
const { wrapper } = require('ferryman-extensions');

function processTrigger(msg, cfg, snapshot) {
  const wrapped = wrapper(this, msg, cfg, snapshot);
  // eslint-disable-next-line no-param-reassign
  msg.body = {};
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);
  return processMethod.call(wrapped, msg, cfg, snapshot);
}

exports.process = processTrigger;
