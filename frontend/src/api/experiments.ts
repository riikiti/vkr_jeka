import api from './client';
import type { ExperimentConfig, ExperimentResult, SATEncodeResult, DiffValidationResult } from '../types';

export async function runExperiment(config: Partial<ExperimentConfig>): Promise<ExperimentResult> {
  const { data } = await api.post('/experiments/run', config);
  return data;
}

export async function listExperiments(): Promise<ExperimentResult[]> {
  const { data } = await api.get('/experiments/list');
  return data;
}

export async function getExperiment(id: string): Promise<ExperimentResult> {
  const { data } = await api.get(`/experiments/${id}`);
  return data;
}

export async function deleteExperiment(id: string): Promise<void> {
  await api.delete(`/experiments/${id}`);
}

export async function encodeSAT(
  hashFunction: string,
  numRounds: number,
  encodeType: string,
): Promise<SATEncodeResult> {
  const { data } = await api.post('/sat/encode', {
    hash_function: hashFunction,
    num_rounds: numRounds,
    encode_type: encodeType,
  });
  return data;
}

export async function validateDifferential(
  hashFunction: string,
  numRounds: number,
  messageDiff: string[],
  numSamples: number = 65536,
  seed: number = 42,
): Promise<DiffValidationResult> {
  const { data } = await api.post('/diff/validate', {
    hash_function: hashFunction,
    num_rounds: numRounds,
    message_diff: messageDiff,
    num_samples: numSamples,
    seed,
  });
  return data;
}
