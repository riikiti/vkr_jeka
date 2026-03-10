import api from './client';
import type { HashFunctionInfo, HashResult, CompareResult } from '../types';

export async function listHashFunctions(): Promise<Record<string, HashFunctionInfo>> {
  const { data } = await api.get('/hash/list');
  return data;
}

export async function computeHash(
  hashFunction: string,
  numRounds: number,
  messageHex: string,
): Promise<HashResult> {
  const { data } = await api.post('/hash/compute', {
    hash_function: hashFunction,
    num_rounds: numRounds,
    message_hex: messageHex,
  });
  return data;
}

export async function compareHashes(
  hashFunction: string,
  numRounds: number,
  msg1Hex: string,
  msg2Hex: string,
): Promise<CompareResult> {
  const { data } = await api.post('/hash/compare', {
    hash_function: hashFunction,
    num_rounds: numRounds,
    message1_hex: msg1Hex,
    message2_hex: msg2Hex,
  });
  return data;
}
