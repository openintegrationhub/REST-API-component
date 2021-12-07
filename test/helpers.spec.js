const { transform } = require('@openintegrationhub/ferryman');
const { expect } = require('chai');
const logger = require('@elastic.io/component-logger')();
const { getMessageSnapshot, getAuthFromSecretConfig } = require('../lib/helpers');

describe('helper functions', () => {
  it('getMessageSnapshot snapshot with existing message, not matched', () => {
    const snapshot = {
      12345: { nextPage: 1, timestamp: Date.now() },
      23456: { nextPage: 3, timestamp: (Date.now() - 60000) },
    };
    const id = '3';
    const responseMessage = { nextPage: 0, timestamp: Date.UTC(0) };
    const result = getMessageSnapshot(id, snapshot);
    expect(result).to.be.eql(responseMessage);
  });
  it('getMessageSnapshot snapshot with existing message, matched', () => {
    const snapshot = {
      12345: { nextPage: 2, timestamp: Date.now() },
      23456: { nextPage: 3, timestamp: (Date.now() - 60000) },
    };
    const id = '12345';
    const responseMessage = snapshot[id];
    const result = getMessageSnapshot(id, snapshot);
    expect(result).to.be.eql(responseMessage);
  });
  it('getMessageSnapshot snapshot undefined', () => {
    const id = '12345';
    const responseMessage = { nextPage: 0, timestamp: Date.UTC(0) };
    const result = getMessageSnapshot(id);
    expect(result).to.be.eql(responseMessage);
  });
  it('getAuthFromSecretConfig, SIMPLE secret', () => {
    const username = 'test1@openintegrationhub.com';
    const passphrase = 'open-sesame';
    const cfg = { username, passphrase };
    const expectedAuth = {
      basic: { username, password: passphrase },
      type: 'Basic Auth',
    };
    const result = getAuthFromSecretConfig(cfg, logger);
    const { auth } = result;
    expect(auth).to.be.eql(expectedAuth);
  });
  it('getAuthFromSecretConfig, MIXED secret object', () => {
    const cfg = {
      secretAuthTransform: '{ "type": "OAuth2", "oauth2": { "keys": { access_token: $.mySecretKeys.mySecretKey } }}',
    };
    // ferryman uses lodash.assign. Simulating how it is added to the config
    Object.assign(cfg, { mySecretKeys: { mySecret: 'open-sesame' } });
    const expectedAuth = transform(cfg, { customMapping: cfg.secretAuthTransform });
    const result = getAuthFromSecretConfig(cfg, logger);
    const { auth } = result;
    expect(auth).to.be.eql(expectedAuth);
  });
  it('getAuthFromSecretConfig, MIXED secret string', () => {
    const cfg = {
      secretAuthTransform: '{ "type": "OAuth2", "oauth2": { "keys": { access_token: $.payload } }}',
    };
    // ferryman uses lodash.assign. Simulating how it is added to the config
    Object.assign(cfg, { payload: 'open-sesame' });
    const expectedAuth = transform(cfg, { customMapping: cfg.secretAuthTransform });
    const result = getAuthFromSecretConfig(cfg, logger);
    const { auth } = result;
    expect(auth).to.be.eql(expectedAuth);
  });
  it('getAuthFromSecretConfig, API_KEY secret', () => {
    const cfg = {};
    // ferryman uses lodash.assign. Simulating how it is added to the config
    Object.assign(cfg, { headerName: 'Authorization', key: 'Bearer beep-boop-bop' });
    const { headerName, key } = cfg;
    const expectedAuth = {
      type: 'API Key Auth',
      apiKey: {
        headerName,
        headerValue: key,
      },
    };
    const result = getAuthFromSecretConfig(cfg, logger);
    const { auth } = result;
    expect(auth).to.be.eql(expectedAuth);
  });
  it('getAuthFromSecretConfig, OA2_AUTHORIZATION_CODE, OA1_TWO_LEGGED, OA1_THREE_LEGGED, or SESSION_AUTH secret', () => {
    const cfg = {};
    // ferryman uses lodash.assign. Simulating how it is added to the config
    Object.assign(cfg, {
      authClientId: 'myclientid',
      refreshToken: 'refreshtoken',
      accessToken: 'open-sesame',
      scope: 'create,read,update,delete',
      expires: '1970-01-01',
      externalId: 'ref-00001',
    });
    const { accessToken } = cfg;
    const expectedAuth = {
      type: 'OAuth2',
      oauth2: {
        keys: {
          access_token: accessToken,
        },
      },
    };
    const result = getAuthFromSecretConfig(cfg, logger);
    const { auth } = result;
    expect(auth).to.be.eql(expectedAuth);
  });
});
