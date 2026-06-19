import { writeAuditLog } from './audit.log';

describe('writeAuditLog', () => {
  it('writes one JSON line with mandatory fields', () => {
    const stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    writeAuditLog({
      event_action: 'resource.created',
      event_category: 'configuration',
      event_outcome: 'success',
      resource_id: 'resource-1',
    });

    const line = String(stdout.mock.calls[0][0]);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toMatchObject({
      audit: true,
      audit_timestamp: expect.any(String),
      event_action: 'resource.created',
      event_category: 'configuration',
      event_outcome: 'success',
      resource_id: 'resource-1',
    });
    stdout.mockRestore();
  });
});
