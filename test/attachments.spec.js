const { transform } = require('@openintegrationhub/ferryman');
const sinon = require('sinon');
const { expect } = require('chai');
const nock = require('nock');
const logger = require('@elastic.io/component-logger')();
const messages = require('../lib/messages');

const { stub } = sinon;

const processAction = require('../lib/triggers/httpRequestTrigger').process;

describe('Attachments processing', () => {
  let emitter;
  let currentlyEmitting = false;
  beforeEach(() => {
    sinon.restore();
    currentlyEmitting = false;
    emitter = {
      emit: stub().returns(
        new Promise((resolve) => {
          // eslint-disable-next-line no-unused-expressions
          expect(currentlyEmitting).to.be.false;
          currentlyEmitting = true;
          setTimeout(() => {
            currentlyEmitting = false;
            resolve();
          }, 1);
        }),
      ),
      logger,
    };
  });

  afterEach(() => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    nock.cleanAll();
  });

  it('add response attachment as buffer', async () => {
    const messagesNewMessageWithBodyStub = stub(
      messages,
      'newMessage',
    ).returns(Promise.resolve());
    const msg = {
      data: {
        url: 'http://example.com',
      },
    };
    const cfg = {
      reader: {
        url: "$$.data.url & '?page=' & data.oihsnapshot.nextPage",
        method: 'POST',
        responseType: 'arraybuffer',
      },
    };
    const responseMessage = { data: 'my data' };
    nock(transform(msg, { customMapping: cfg.reader.url }, undefined))
      .post('/')
      .reply(() => [200, responseMessage]);
    await processAction.call(emitter, msg, cfg);
    expect(messagesNewMessageWithBodyStub.calledOnce).to.be.true;
    expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql(responseMessage);
  });

  it('add response attachment as stream', async () => {
    const messagesNewMessageWithBodyStub = stub(
      messages,
      'newMessage',
    ).returns(Promise.resolve());
    const msg = {
      data: {
        url: 'http://example.com',
      },
    };
    const cfg = {
      reader: {
        url: "$$.data.url & '?page=' & data.oihsnapshot.nextPage",
        method: 'POST',
        responseType: 'stream',
      },
    };
    const responseMessage = { data: 'my data' };
    nock(transform(msg, { customMapping: cfg.reader.url }, undefined))
      .post('/')
      .reply(() => [200, responseMessage]);
    await processAction.call(emitter, msg, cfg);
    expect(messagesNewMessageWithBodyStub.calledOnce).to.be.true;
    expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql(responseMessage);
  });
});
