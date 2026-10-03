import { randomBytes } from 'node:crypto';
console.log('CUSTOMER_DATA_ENCRYPTION_KEY='+randomBytes(32).toString('base64'));
