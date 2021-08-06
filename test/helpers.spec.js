const { expect } = require('chai');

const { getMessageSnapshot } = require('../lib/helpers');

describe('helper functions', () => {
  it('getMessageSnapshot snapshot with existing message, not matched', () => {
    const snapshot = {
      12345: { nextPage: 1, timestamp: Date.now() },
      23456: { nextPage: 3, timestamp: (Date.now() - 60000) },
    };
    const id = '3';
    const responseMessage = { nextPage: 1, timestamp: Date.UTC(0) };
    const result = getMessageSnapshot(id, snapshot);
    expect(result).to.be.eql(responseMessage);
  });
  it('getMessageSnapshot snapshot with existing message, matched', async () => {
    const snapshot = {
      12345: { nextPage: 2, timestamp: Date.now() },
      23456: { nextPage: 3, timestamp: (Date.now() - 60000) },
    };
    const id = '12345';
    const responseMessage = snapshot[id];
    const result = getMessageSnapshot(id, snapshot);
    expect(result).to.be.eql(responseMessage);
  });
  it('getMessageSnapshot snapshot undefined', async () => {
    const id = '12345';
    const responseMessage = { nextPage: 1, timestamp: Date.UTC(0) };
    const result = getMessageSnapshot(id);
    expect(result).to.be.eql(responseMessage);
  });
});
