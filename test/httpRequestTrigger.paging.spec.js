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

    nock(transform(msg, { customMapping: cfg.reader.url }))
      .post('/')
      .reply(() => [200, responseMessage]);
    await processAction.call(emitter, msg, cfg);

    expect(emitter.emit.withArgs('snapshot').callCount).to.be.equal(1);
    expect(emitter.emit.withArgs('snapshot').args[0][1]).to.deep.equal(snapshot);
  });

  it('paging loop, 1 page', async () => {
    const messagesNewMessageWithBodyStub = stub(
      messages,
      'newMessage',
    ).returns(Promise.resolve());
    const msg = {
      id: '123456789',
      data: {
        url: 'http://example.com',
      },
    };
    const cfg = {
      reader: {
        url: "$$.data.url & '?page=' & data.oihsnapshot.nextPage & '&date_modified=' & data.oihsnapshot.timestamp",
        method: 'GET',
        responseToSnapshotTransform: "{ 'nextPage': data.offset * data.page_size <= data.total_count ? data.offset + 1 : (),'timestamp': oihsnapshot.timestamp}",
        pagingEnabled: true,
        lastPageValidator: 'data.offset * data.page_size >= data.total_count',
      },
    };
    const responseMessage = {
      data: {
        test: 'my data',
        offset: 1,
        page_size: 10,
        total_count: 4,
      },
    };
    msg.data.oihsnapshot = { nextPage: 0, timestamp: Date.UTC(0) };
    nock(transform(msg, { customMapping: cfg.reader.url }))
      .get('/')
      .query(true)
      .reply(() => [200, responseMessage]);
    delete msg.data.oihsnapshot; // Snapshot needs to be removed before sending test message
    await processAction.call(emitter, msg, cfg);
    expect(messagesNewMessageWithBodyStub.calledOnce).to.be.true;
    expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql(responseMessage);
  });

  it('paging loop, invalid lastPage does not continue looping', async () => {
    const messagesNewMessageWithBodyStub = stub(
      messages,
      'newMessage',
    ).returns(Promise.resolve());
    const msg = {
      id: '123456789',
      data: {
        url: 'http://example.com',
      },
    };
    const cfg = {
      reader: {
        url: "$$.data.url & '?page=' & data.oihsnapshot.nextPage & '&date_modified=' & data.oihsnapshot.timestamp",
        method: 'GET',
        responseToSnapshotTransform: "{ 'nextPage': data.offset * data.page_size <= data.total_count ? data.offset + 1 : (),'timestamp': oihsnapshot.timestamp}",
        pagingEnabled: true,
        lastPageValidator: '"undefined"',
      },
    };
    const responseMessage = {
      data: {
        test: 'my data',
        offset: 1,
        page_size: 10,
        total_count: 4,
      },
    };
    msg.data.oihsnapshot = { nextPage: 0, timestamp: Date.UTC(0) };
    nock(transform(msg, { customMapping: cfg.reader.url }))
      .get('/')
      .query(true)
      .reply(() => [200, responseMessage]);
    delete msg.data.oihsnapshot; // Snapshot needs to be removed before sending test message
    await processAction.call(emitter, msg, cfg);
    expect(messagesNewMessageWithBodyStub.calledOnce).to.be.true;
    expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql(responseMessage);
  });

  it('paging loop, 3 pages', async () => {
    const messagesNewMessageWithBodyStub = stub(
      messages,
      'newMessage',
    ).returns(Promise.resolve());
    const msg = {
      id: '123456789',
      data: {
        url: 'http://example.com',
      },
    };
    const cfg = {
      reader: {
        url: "$$.data.url & '?page=' & data.oihsnapshot.nextPage & '&date_modified=' & data.oihsnapshot.timestamp",
        method: 'GET',
        responseToSnapshotTransform: "{ 'nextPage': data.offset * data.page_size <= data.total_count ? data.offset + 1 : (),'timestamp': oihsnapshot.timestamp}",
        pagingEnabled: true,
        lastPageValidator: 'data.offset * data.page_size >= data.total_count',
      },
    };
    const responseMessage = {
      data: {
        test: 'my data',
        offset: 1,
        page_size: 10,
        total_count: 20,
      },
    };
    msg.data.oihsnapshot = { nextPage: 1, timestamp: Date.UTC(0) };
    nock(transform(msg, { customMapping: cfg.reader.url }))
      .get('/')
      .query(true)
      .reply(() => [200, responseMessage]);
    const responseMessage1 = {
      data: {
        test: 'my data',
        offset: 2,
        page_size: 10,
        total_count: 20,
      },
    };
    msg.data.oihsnapshot = { nextPage: 2, timestamp: Date.UTC(0) };
    nock(transform(msg, { customMapping: cfg.reader.url }))
      .get('/')
      .query(true)
      .reply(() => [200, responseMessage1]);
    delete msg.data.oihsnapshot; // Snapshot needs to be removed before sending test message
    await processAction.call(emitter, msg, cfg);
    expect(messagesNewMessageWithBodyStub.calledTwice).to.be.true;
    expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql(responseMessage);
  });

  it('paging loop, 3 times, POST request', async () => {
    const messagesNewMessageWithBodyStub = stub(
      messages,
      'newMessage',
    ).returns(Promise.resolve());
    const msg = {
      id: '123456789',
      data: {
        url: 'http://example.com',
      },
    };
    const cfg = {
      reader: {
        url: "$$.data.url",
        method: 'POST',
        responseToSnapshotTransform: "{ 'nextPage': data.offset * data.page_size <= data.total_count ? data.offset + 1 : (),'timestamp': oihsnapshot.timestamp}",
        pagingEnabled: true,
        lastPageValidator: 'data.offset * data.page_size >= data.total_count',
        body: {
          raw: "$$.oihsnapshot.nextPage"
        },
      },
    };
    const responseMessage = {
      data: {
        test: 'my data',
        offset: 1,
        page_size: 10,
        total_count: 20,
      },
    };
    msg.data.oihsnapshot = { nextPage: 1, timestamp: Date.UTC(0) };
    nock(transform(msg, { customMapping: cfg.reader.url }))
      .post('/')
      .query(true)
      .reply(() => [200, responseMessage]);
    const responseMessage1 = {
      data: {
        test: 'my data',
        offset: 2,
        page_size: 10,
        total_count: 20,
      },
    };
    msg.data.oihsnapshot = { nextPage: 2, timestamp: Date.UTC(0) };
    nock(transform(msg, { customMapping: cfg.reader.url }))
      .post('/')
      .query(true)
      .reply(() => [200, responseMessage1]);
    delete msg.data.oihsnapshot; // Snapshot needs to be removed before sending test message
    await processAction.call(emitter, msg, cfg);
    expect(messagesNewMessageWithBodyStub.calledTwice).to.be.true;
    expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql(responseMessage);
  })

  it('paging loop, error thrown', async () => {

  });
});
