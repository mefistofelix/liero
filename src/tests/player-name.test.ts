import {test,expect} from 'bun:test';
import {playerName} from '../browser/player-name.ts';

test('player names remain bounded even for untrusted peer messages and local profiles',()=>{
 expect(playerName('W'.repeat(100000))).toBe('W'.repeat(20));
 expect(playerName('\u202eBad\nName\u2069')).toBe('BadName');
 expect(playerName({name:'Wrong type'})).toBe('Player');
 expect(playerName('', '')).toBe('');
 expect(playerName('  Michele  ')).toBe('Michele');
});
