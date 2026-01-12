import pino from 'pino';
import { env } from './env';

// Create base logger configuration
const loggerConfig: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  ...(env.LOG_PRETTY &&
    env.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  ...(env.NODE_ENV === 'production' && {
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
};

// Create the main logger
export const logger = pino(loggerConfig);

// Create child loggers for different components
export const createChildLogger = (component: string): pino.Logger => {
  return logger.child({ component });
};

// Specific loggers for different parts of the application
export const dbLogger = createChildLogger('database');
export const authLogger = createChildLogger('auth');
export const apiLogger = createChildLogger('api');
export const emailLogger = createChildLogger('email');
export const auditLogger = createChildLogger('audit');

// HTTP request logger middleware configuration
export const httpLoggerConfig = {
  logger,
  customLogLevel: (_req: any, res: any, err?: Error) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    } else if (res.statusCode >= 500 || err) {
      return 'error';
    }
    return 'info';
  },
  customSuccessMessage: (req: any, res: any) => {
    return `${req.method} ${req.url} - ${res.statusCode}`;
  },
  customErrorMessage: (req: any, res: any, err: Error) => {
    return `${req.method} ${req.url} - ${res.statusCode} - ${err.message}`;
  },
  serializers: {
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': res.headers['content-type'],
        'content-length': res.headers['content-length'],
      },
    }),
  },
};
