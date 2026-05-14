import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const log = (...args) => {
  if (process.env.CONFIG_LOG_LEVEL?.toUpperCase() == "VERBOSE") {
    console.error(...args);
  }
};

const AZOR_DIR = join(homedir(), '.azor');

const server = new McpServer({
  name: 'AZOR files',
  version: '1.0.0'
});

// Helper function to extract date from first timestamp in history
const getThreadDate = (thread) => {
  if (thread.history && thread.history.length > 0 && thread.history[0].timestamp) {
    const timestamp = thread.history[0].timestamp;
    // Extract YYYY-MM-DD from ISO timestamp
    return timestamp.split('T')[0];
  }
  return null;
};

// Helper function to check if date is in range
const isDateInRange = (date, fromDate, toDate) => {
  if (!date) return false;
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
};

server.tool(
  'list_azor_threads',
  'Lists all AZOR threads with optional date filtering',
  {
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter threads from this date (YYYY-MM-DD, inclusive)'),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter threads to this date (YYYY-MM-DD, inclusive)'),
  },
  async ({ fromDate, toDate }) => {
    log('[list_azor_threads]', { fromDate, toDate });
    
    const files = await readdir(AZOR_DIR);
    const logFiles = files.filter(f => f.endsWith('-log.json'));
    
    const threads = [];
    
    for (const file of logFiles) {
      const filePath = join(AZOR_DIR, file);
      const content = await readFile(filePath, 'utf-8');
      const thread = JSON.parse(content);
      
      const date = getThreadDate(thread);
      
      // Filter by date range if specified
      if (!isDateInRange(date, fromDate, toDate)) {
        continue;
      }
      
      threads.push({
        session_id: thread.session_id || null,
        assistant_id: thread.assistant_id || null,
        title: thread.title || null,
        date: date
      });
    }
    
    // Sort by date (newest first)
    threads.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(threads, null, 2)
      }]
    };
  }
);

server.tool(
  'get_azor_thread',
  'Returns full JSON content of a specific AZOR thread',
  {
    session_id: z.string().describe('Session ID of the thread to retrieve'),
  },
  async ({ session_id }) => {
    log('[get_azor_thread]', { session_id });
    
    const filePath = join(AZOR_DIR, `${session_id}-log.json`);
    const content = await readFile(filePath, 'utf-8');
    
    return {
      content: [{
        type: 'text',
        text: content
      }]
    };
  }
);

server.tool(
  'delete_azor_threads',
  'Deletes one or more AZOR threads by session ID',
  {
    session_ids: z.array(z.string()).describe('Array of session IDs to delete'),
  },
  async ({ session_ids }) => {
    log('[delete_azor_threads]', { session_ids });
    
    const deleted = [];
    
    for (const session_id of session_ids) {
      const filePath = join(AZOR_DIR, `${session_id}-log.json`);
      try {
        await unlink(filePath);
        deleted.push(session_id);
      } catch (error) {
        // File doesn't exist or already deleted - ignore
        log('[delete_azor_threads] File not found:', filePath);
      }
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ deleted, count: deleted.length }, null, 2)
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
