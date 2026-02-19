import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

import {
  listFeedbackEntries, getFeedbackEntry, createFeedbackEntry,
  updateFeedbackEntry, deleteFeedbackEntry,
} from '../feedbackRepository';

async function reset() {
  const { resetTestDb } = await import('./helpers/mockConnectionFactory');
  resetTestDb();
}

describe('feedbackRepository', () => {
  beforeEach(async () => { await reset(); });

  describe('createFeedbackEntry', () => {
    it('should create a feedback entry with required fields', () => {
      const result = createFeedbackEntry({ type: 'problem', title: 'Bug Report', description: 'Something is broken' });
      expect(result.feedback_id).toBeTruthy();
      expect(result.type).toBe('problem');
      expect(result.title).toBe('Bug Report');
      expect(result.description).toBe('Something is broken');
      expect(result.status).toBe('new');
      expect(result.contact).toBeNull();
    });

    it('should use provided feedback_id', () => {
      const result = createFeedbackEntry({ feedback_id: 'custom-id', type: 'suggestion', title: 'Feature', description: 'Add dark mode' });
      expect(result.feedback_id).toBe('custom-id');
    });

    it('should normalize feedback type', () => {
      const result = createFeedbackEntry({ type: 'improvement' as 'suggestion', title: 'T', description: 'D' });
      expect(result.type).toBe('suggestion');
    });

    it('should normalize unknown type', () => {
      const result = createFeedbackEntry({ type: 'invalid_type' as 'unknown', title: 'T', description: 'D' });
      expect(result.type).toBe('unknown');
    });

    it('should set default title when empty', () => {
      const result = createFeedbackEntry({ type: 'problem', title: '', description: 'Desc' });
      expect(result.title.length).toBeGreaterThan(0);
    });

    it('should set default description when empty', () => {
      const result = createFeedbackEntry({ type: 'problem', title: 'Title', description: '' });
      expect(result.description).toBeTruthy();
    });

    it('should store contact info', () => {
      const result = createFeedbackEntry({ type: 'problem', title: 'T', description: 'D', contact: 'user@example.com' });
      expect(result.contact).toBe('user@example.com');
    });

    it('should normalize in-progress status', () => {
      const result = createFeedbackEntry({ type: 'problem', title: 'T', description: 'D', status: 'in-progress' as 'in_progress' });
      expect(result.status).toBe('in_progress');
    });

    it('should throw on duplicate feedback_id', () => {
      createFeedbackEntry({ feedback_id: 'dup', type: 'problem', title: 'T', description: 'D' });
      expect(() => createFeedbackEntry({ feedback_id: 'dup', type: 'problem', title: 'T2', description: 'D2' })).toThrow();
    });
  });

  describe('getFeedbackEntry', () => {
    it('should return a feedback entry by ID', () => {
      createFeedbackEntry({ feedback_id: 'fb-1', type: 'problem', title: 'Bug', description: 'Broken' });
      const result = getFeedbackEntry('fb-1');
      expect(result).toBeTruthy();
      expect(result!.feedback_id).toBe('fb-1');
    });

    it('should return undefined for non-existent ID', () => {
      expect(getFeedbackEntry('nonexistent')).toBeUndefined();
    });
  });

  describe('listFeedbackEntries', () => {
    it('should return empty array when no entries', () => {
      expect(listFeedbackEntries()).toEqual([]);
    });

    it('should return all entries as summaries', () => {
      createFeedbackEntry({ feedback_id: 'fb-1', type: 'problem', title: 'Bug 1', description: 'D1' });
      createFeedbackEntry({ feedback_id: 'fb-2', type: 'suggestion', title: 'F1', description: 'D2' });
      const result = listFeedbackEntries();
      expect(result).toHaveLength(2);
      expect(result[0].excerpt).toBeTruthy();
      expect(typeof result[0].has_resolution).toBe('boolean');
    });

    it('should truncate long descriptions in excerpt', () => {
      createFeedbackEntry({ feedback_id: 'fb-long', type: 'problem', title: 'Long', description: 'A'.repeat(500) });
      const result = listFeedbackEntries();
      const entry = result.find((e) => e.feedback_id === 'fb-long');
      expect(entry!.excerpt.length).toBeLessThanOrEqual(281);
    });
  });

  describe('updateFeedbackEntry', () => {
    it('should update title', () => {
      createFeedbackEntry({ feedback_id: 'fb-1', type: 'problem', title: 'Old', description: 'D' });
      expect(updateFeedbackEntry('fb-1', { title: 'New Title' }).title).toBe('New Title');
    });

    it('should update status', () => {
      createFeedbackEntry({ feedback_id: 'fb-1', type: 'problem', title: 'T', description: 'D' });
      expect(updateFeedbackEntry('fb-1', { status: 'resolved' }).status).toBe('resolved');
    });

    it('should update resolution', () => {
      createFeedbackEntry({ feedback_id: 'fb-1', type: 'problem', title: 'T', description: 'D' });
      expect(updateFeedbackEntry('fb-1', { resolution: 'Fixed' }).resolution).toBe('Fixed');
    });

    it('should throw for non-existent feedback', () => {
      expect(() => updateFeedbackEntry('nonexistent', { title: 'New' })).toThrow();
    });

    it('should keep existing values when patch is partial', () => {
      createFeedbackEntry({ feedback_id: 'fb-1', type: 'problem', title: 'Original', description: 'OrigDesc', contact: 'orig@test.com' });
      const result = updateFeedbackEntry('fb-1', { title: 'New' });
      expect(result.title).toBe('New');
      expect(result.description).toBe('OrigDesc');
      expect(result.contact).toBe('orig@test.com');
    });
  });

  describe('deleteFeedbackEntry', () => {
    it('should delete an existing entry', () => {
      createFeedbackEntry({ feedback_id: 'fb-1', type: 'problem', title: 'T', description: 'D' });
      deleteFeedbackEntry('fb-1');
      expect(getFeedbackEntry('fb-1')).toBeUndefined();
    });

    it('should throw for non-existent entry', () => {
      expect(() => deleteFeedbackEntry('nonexistent')).toThrow();
    });
  });
});
