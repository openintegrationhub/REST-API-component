const { transform } = require('@openintegrationhub/ferryman');
const sinon = require('sinon');
const { expect } = require('chai');
const nock = require('nock');
const logger = require('@elastic.io/component-logger')();
const messages = require('../lib/messages');

const { stub } = sinon;

const processAction = require('../lib/triggers/httpRequestTrigger').process;

describe('httpRequest action paging', () => {
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

  it('retrieve snapshot and set in url', async () => {
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
      },
    };
    const responseMessage = { data: 'my data' };
    const snapshot = { nextPage: 1 };
    msg.data.oihsnapshot = snapshot;
    nock(transform(msg, { customMapping: cfg.reader.url }, undefined))
      .post('/')
      .query(true)
      .reply(() => [200, responseMessage]);
    delete msg.data.oihsnapshot; // Snapshot needs to be removed before sending test message
    await processAction.call(emitter, msg, cfg, snapshot);
    expect(messagesNewMessageWithBodyStub.calledOnce).to.be.true;
    expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql(responseMessage);
  });

  it('set transformed response body to snapshot', async () => {
    const msg = {
      data: {
        url: 'http://example.com',
      },
    };
    const cfg = {
      reader: {
        url: '$$.data.url',
        method: 'POST',
        responseToSnapshotTransform: '$$.data.paging',
      },
    };
    const snapshot = { nextPage: 1 };
    const responseMessage = {
      data: {
        custom: 'my data',
        paging: snapshot,
      },
    };

    nock(transform(msg, { customMapping: cfg.reader.url }, undefined))
      .post('/')
      .reply(() => [200, responseMessage]);
    await processAction.call(emitter, msg, cfg);

    expect(emitter.emit.withArgs('snapshot').callCount).to.be.equal(1);
    expect(emitter.emit.withArgs('snapshot').args[0][1]).to.deep.equal(snapshot);
  });
});
