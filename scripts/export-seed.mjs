import { writeFileSync } from 'node:fs';
import { createParty } from '../lib/game/seed.ts';
const {questions,secrets}=createParty('not-a-live-room',{admin:'not-an-account',marlene:'not-an-account'});
writeFileSync('db/seed.json',JSON.stringify({questions,secrets},null,2)+'\n');
console.log('Seed exported to db/seed.json. No party or credentials were created.');
