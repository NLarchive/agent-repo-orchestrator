const SqliteQueue = require('../../engine/sqlite-queue');
const DatabaseClient = require('../../db/client');

describe('SqliteQueue', () => {
  let db;
  let queue;

  beforeEach(() => {
    db = new DatabaseClient(':memory:');
    db.connect();
    db.initialize();
    queue = new SqliteQueue(db);
  });

  afterEach(() => {
    queue.stop();
    db.close();
  });

  describe('enqueue', () => {
    it('should add task to queue', () => {
      const result = queue.enqueue('task-1', { data: 'test' });
      expect(result).toBe(true);

      const stats = queue.getStats();
      expect(stats.pending).toBe(1);
    });

    it('should respect priority', () => {
      queue.enqueue('prio-task-1', { data: 'low' }, { priority: 0 });
      queue.enqueue('prio-task-2', { data: 'high' }, { priority: 10 });

      const task = queue.dequeue();
      expect(task.task_id).toBe('prio-task-2');
    });

    it('should handle delayed tasks', () => {
      queue.enqueue('task-1', { data: 'delayed' }, { delay: 10000 });

      const task = queue.dequeue();
      expect(task).toBeNull();
    });

    it('should not allow duplicate task IDs', () => {
      queue.enqueue('task-1', { data: 'first' });
      const result = queue.enqueue('task-1', { data: 'duplicate' });
      
      expect(result).toBe(false);
    });
  });

  describe('dequeue', () => {
    it('should return null when queue is empty', () => {
      const task = queue.dequeue();
      expect(task).toBeNull();
    });

    it('should return and mark task as processing', () => {
      queue.enqueue('deq-task-1', { data: 'test' });

      const task = queue.dequeue();
      expect(task.task_id).toBe('deq-task-1');
      expect(task.payload).toEqual({ data: 'test' });

      const stats = queue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(1);
    });

    it('should return tasks in priority order', () => {
      queue.enqueue('order-task-1', { data: '1' }, { priority: 5 });
      queue.enqueue('order-task-2', { data: '2' }, { priority: 10 });
      queue.enqueue('order-task-3', { data: '3' }, { priority: 1 });

      expect(queue.dequeue().task_id).toBe('order-task-2');
      expect(queue.dequeue().task_id).toBe('order-task-1');
      expect(queue.dequeue().task_id).toBe('order-task-3');
    });
  });

  describe('complete', () => {
    it('should mark task as completed', () => {
      queue.enqueue('complete-task', { data: 'test' });
      queue.dequeue();
      queue.complete('complete-task');

      const stats = queue.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.processing).toBe(0);
    });
  });

  describe('fail', () => {
    it('should retry task on failure', () => {
      queue.enqueue('retry-task', { data: 'test' }, { maxRetries: 3 });
      queue.dequeue();
      queue.fail('retry-task', new Error('Test error'));

      const stats = queue.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(0);
    });

    it('should mark task as failed after max retries', () => {
      queue.enqueue('fail-task', { data: 'test' }, { maxRetries: 2 });
      
      queue.dequeue();
      queue.fail('fail-task', new Error('Error 1'));
      
      queue.dequeue();
      queue.fail('fail-task', new Error('Error 2'));

      const stats = queue.getStats();
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('should process tasks automatically', (done) => {
      const processor = jest.fn().mockResolvedValue(undefined);
      
      queue.enqueue('auto-task', { data: 'test' });
      queue.start(processor, 100);

      setTimeout(() => {
        expect(processor).toHaveBeenCalledWith({ data: 'test' });
        queue.stop();
        done();
      }, 250);
    });

    it('should handle processor errors', (done) => {
      const processor = jest.fn().mockRejectedValue(new Error('Processor error'));
      
      queue.enqueue('error-task', { data: 'test' }, { maxRetries: 1 });
      queue.start(processor, 100);

      setTimeout(() => {
        const stats = queue.getStats();
        expect(stats.failed).toBe(1);
        queue.stop();
        done();
      }, 300);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed tasks', () => {
      queue.enqueue('cleanup-task', { data: 'test' });
      queue.dequeue();
      queue.complete('cleanup-task');

      // Manually update completion time to past
      db.db.prepare(`
        UPDATE task_queue 
        SET completed_at = datetime('now', '-2 days')
        WHERE task_id = 'cleanup-task'
      `).run();

      const deleted = queue.cleanup(24 * 60 * 60 * 1000);
      expect(deleted).toBe(1);

      const stats = queue.getStats();
      expect(stats.completed).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      queue.enqueue('stats-task-1', { data: '1' });
      queue.enqueue('stats-task-2', { data: '2' });
      queue.dequeue();

      const stats = queue.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(1);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });
});

// Nicolas Larenas, nlarchive
