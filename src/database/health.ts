import { db } from './connection';

export interface DatabaseHealth {
  isConnected: boolean;
  error?: string;
  latency?: number;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    const startTime = Date.now();
    await db.raw('SELECT 1');
    const latency = Date.now() - startTime;
    
    return {
      isConnected: true,
      latency,
    };
  } catch (error) {
    return {
      isConnected: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}