const { processMethod } = require('../utils.js');
const { wrapper } = require('@blendededge/ferryman-extensions');

function processAction(msg, cfg, snapshot, headers, tokenData = {}) {
  const wrapped = wrapper(this, msg, cfg, snapshot, headers, tokenData);
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);
  this.logger.debug('snapshot: ', snapshot);
  const TOKEN = cfg.token || tokenData.apiKey;
  return processMethod.call(wrapped, msg, cfg, snapshot, TOKEN);
}

exports.process = processAction;
