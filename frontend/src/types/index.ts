export interface HashFunctionInfo {
  name: string;
  max_rounds: number;
  hash_size: number;
}

export interface HashResult {
  hash_hex: string;
  hash_function: string;
  num_rounds: number;
  message_length: number;
}

export interface CompareResult {
  hash1_hex: string;
  hash2_hex: string;
  hashes_equal: boolean;
  xor_diff_hex: string;
  hamming_distance: number;
}

export interface ExperimentConfig {
  hash_function: string;
  num_rounds: number;
  method: string;
  combined_strategy: string;
  solver: string;
  timeout: number;
  seed: number;
  probability_threshold_log2: number;
  max_characteristics: number;
  repetitions: number;
  comment: string;
}

export interface ExperimentResult {
  id: string;
  config: ExperimentConfig;
  status: string;
  started_at: number;
  completed_at?: number;
  results?: Record<string, unknown>;
  error?: string;
}

export interface SATEncodeResult {
  hash_function: string;
  num_rounds: number;
  encode_type: string;
  num_variables: number;
  num_clauses: number;
  clause_length_distribution: Record<string, number>;
}

export interface DiffValidationResult {
  hash_function: string;
  num_rounds: number;
  num_samples: number;
  collisions: number;
  collision_rate: number;
  partial_match_rates: number[];
}
