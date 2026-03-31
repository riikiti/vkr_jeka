"""
Chapter 4 Experiments: Comprehensive SAT-based collision attack experiments.

Runs 4 experiments and saves structured results to docs/vkr/chapters/experiment_data.json.
"""

import json
import os
import struct
import sys
import time
import traceback

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.sat_encoding.hash_encoder import CollisionEncoder
from src.combined.sequential import sequential_attack, generate_message_diffs
from src.combined.iterative import iterative_attack
from src.combined.hybrid import hybrid_attack
from src.solver.pysat_runner import PySATRunner
from src.hash_functions.sha256 import SHA256Reduced
from src.hash_functions.md5 import MD5Reduced
from src.hash_functions.md4 import MD4Reduced

import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

results = {
    "metadata": {
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "description": "Chapter 4 experimental results for dissertation",
    },
    "experiment1_complexity": [],
    "experiment2_solver_comparison": [],
    "experiment3_strategy_comparison": [],
    "experiment4_collisions": [],
}


def words_to_hex(words):
    return [f"0x{w & 0xFFFFFFFF:08x}" for w in words]


def compute_hash_hex(hash_cls, num_rounds, m_words, big_endian=True):
    h = hash_cls(num_rounds=num_rounds)
    if big_endian:
        m_bytes = struct.pack(f'>{len(m_words)}I', *[w & 0xFFFFFFFF for w in m_words])
    else:
        m_bytes = struct.pack(f'<{len(m_words)}I', *[w & 0xFFFFFFFF for w in m_words])
    return h.hash(m_bytes).hex()


def hamming_weight_words(words):
    return sum(bin(w & 0xFFFFFFFF).count('1') for w in words)


def xor_diff_words(m1, m2):
    return [(a ^ b) & 0xFFFFFFFF for a, b in zip(m1, m2)]


# ============================================================
# EXPERIMENT 1: Complexity vs Rounds
# ============================================================
def run_experiment1():
    print("\n" + "="*70)
    print("EXPERIMENT 1: Complexity vs Rounds")
    print("="*70)

    configs = [
        ("sha256", list(range(1, 9))),    # SHA-256 rounds 1-8
        ("md5",    list(range(1, 11))),    # MD5 rounds 1-10
        ("md4",    list(range(1, 13))),    # MD4 rounds 1-12
    ]

    for hash_name, round_list in configs:
        for num_rounds in round_list:
            print(f"\n--- {hash_name.upper()} {num_rounds} rounds ---")

            # Get CNF size
            try:
                enc = CollisionEncoder(num_rounds, hash_function=hash_name)
                enc.encode()
                diff = [0]*16
                diff[0] = 0x80000000
                enc.fix_message_difference(diff)
                num_vars = enc.builder.num_vars
                num_clauses = enc.builder.num_clauses
                print(f"  CNF: {num_vars} vars, {num_clauses} clauses")
            except Exception as e:
                print(f"  CNF encoding failed: {e}")
                num_vars = 0
                num_clauses = 0

            # Run sequential_attack
            try:
                t0 = time.time()
                ar = sequential_attack(
                    num_rounds=num_rounds,
                    solver_name="cadical153",
                    timeout_per_char=60,
                    max_characteristics=16,
                    hash_function=hash_name,
                )
                total_time = time.time() - t0

                attempts_data = []
                for a in ar.attempts:
                    attempts_data.append({
                        "result": a.result,
                        "solve_time": round(a.solve_time, 4),
                        "encoding_time": round(a.encoding_time, 4),
                    })

                entry = {
                    "hash_function": hash_name,
                    "rounds": num_rounds,
                    "num_vars": num_vars,
                    "num_clauses": num_clauses,
                    "success": ar.success,
                    "total_time": round(total_time, 4),
                    "characteristics_tried": ar.characteristics_tried,
                    "attempts": attempts_data,
                }

                if ar.success:
                    print(f"  COLLISION FOUND in {total_time:.2f}s after {ar.characteristics_tried} attempts")
                else:
                    print(f"  No collision in {total_time:.2f}s after {ar.characteristics_tried} attempts")

                results["experiment1_complexity"].append(entry)

            except Exception as e:
                print(f"  Attack failed: {e}")
                traceback.print_exc()
                results["experiment1_complexity"].append({
                    "hash_function": hash_name,
                    "rounds": num_rounds,
                    "num_vars": num_vars,
                    "num_clauses": num_clauses,
                    "success": False,
                    "total_time": 0,
                    "error": str(e),
                    "attempts": [],
                })


# ============================================================
# EXPERIMENT 2: Solver Comparison
# ============================================================
def run_experiment2():
    print("\n" + "="*70)
    print("EXPERIMENT 2: Solver Comparison (SHA-256, 3 rounds)")
    print("="*70)

    solvers = ["cadical153", "glucose4", "minisat22"]
    diff = [0]*16
    diff[0] = 0x80000000
    num_rounds = 3
    runs_per_solver = 3

    for solver_name in solvers:
        for run_idx in range(runs_per_solver):
            print(f"\n--- {solver_name} run {run_idx+1}/{runs_per_solver} ---")

            try:
                # Encode fresh for each run
                enc = CollisionEncoder(num_rounds, hash_function="sha256")
                enc.encode()
                enc.fix_message_difference(diff)

                import tempfile
                fd, cnf_file = tempfile.mkstemp(suffix='.cnf', prefix=f'exp2_{solver_name}_')
                os.close(fd)
                enc.builder.write_dimacs(cnf_file)

                msg_var_ids = [v for word in enc._msg1 for v in word] + \
                              [v for word in enc._msg2 for v in word]

                runner = PySATRunner(solver_name)
                solve_seed = int(time.time() * 1000) ^ (run_idx * 7 + 13)
                t0 = time.time()
                output = runner.solve(cnf_file, timeout=60,
                                      random_phase_vars=msg_var_ids, seed=solve_seed)
                elapsed = time.time() - t0

                try:
                    os.unlink(cnf_file)
                except OSError:
                    pass

                entry = {
                    "solver": solver_name,
                    "run": run_idx + 1,
                    "result": output.result.value,
                    "time": round(elapsed, 4),
                    "conflicts": output.stats.num_conflicts,
                    "decisions": output.stats.num_decisions,
                    "propagations": output.stats.num_propagations,
                    "restarts": output.stats.num_restarts,
                }

                print(f"  Result: {output.result.value} in {elapsed:.2f}s")
                print(f"  Conflicts: {output.stats.num_conflicts}, "
                      f"Decisions: {output.stats.num_decisions}, "
                      f"Propagations: {output.stats.num_propagations}")

                results["experiment2_solver_comparison"].append(entry)

            except Exception as e:
                print(f"  Failed: {e}")
                traceback.print_exc()
                results["experiment2_solver_comparison"].append({
                    "solver": solver_name,
                    "run": run_idx + 1,
                    "error": str(e),
                })


# ============================================================
# EXPERIMENT 3: Strategy Comparison
# ============================================================
def run_experiment3():
    print("\n" + "="*70)
    print("EXPERIMENT 3: Strategy Comparison")
    print("="*70)

    configs = [
        ("sha256", list(range(1, 4))),   # SHA-256: 1-3 rounds
        ("md5",    list(range(1, 5))),    # MD5: 1-4 rounds
    ]

    strategies = {
        "sequential": sequential_attack,
        "iterative": iterative_attack,
        "hybrid": hybrid_attack,
    }

    for hash_name, round_list in configs:
        for num_rounds in round_list:
            for strat_name, strat_func in strategies.items():
                print(f"\n--- {hash_name.upper()} {num_rounds}R, strategy={strat_name} ---")

                try:
                    t0 = time.time()
                    ar = strat_func(
                        num_rounds=num_rounds,
                        solver_name="cadical153",
                        timeout_per_char=60,
                        max_characteristics=16,
                        hash_function=hash_name,
                    )
                    total_time = time.time() - t0

                    entry = {
                        "hash_function": hash_name,
                        "rounds": num_rounds,
                        "strategy": strat_name,
                        "success": ar.success,
                        "time": round(total_time, 4),
                        "attempts_count": ar.characteristics_tried,
                    }

                    if ar.success:
                        print(f"  SUCCESS in {total_time:.2f}s ({ar.characteristics_tried} attempts)")
                    else:
                        print(f"  FAILED in {total_time:.2f}s ({ar.characteristics_tried} attempts)")

                    results["experiment3_strategy_comparison"].append(entry)

                except Exception as e:
                    print(f"  Error: {e}")
                    traceback.print_exc()
                    results["experiment3_strategy_comparison"].append({
                        "hash_function": hash_name,
                        "rounds": num_rounds,
                        "strategy": strat_name,
                        "success": False,
                        "error": str(e),
                    })


# ============================================================
# EXPERIMENT 4: Collect Found Collisions
# ============================================================
def run_experiment4():
    print("\n" + "="*70)
    print("EXPERIMENT 4: Collecting Actual Collision Examples")
    print("="*70)

    hash_configs = {
        "sha256": (SHA256Reduced, list(range(1, 3)), True),    # 1-2 rounds
        "md5":    (MD5Reduced,    list(range(1, 5)), False),   # 1-4 rounds
        "md4":    (MD4Reduced,    list(range(1, 7)), False),   # 1-6 rounds
    }

    for hash_name, (hash_cls, round_list, big_endian) in hash_configs.items():
        for num_rounds in round_list:
            print(f"\n--- {hash_name.upper()} {num_rounds} rounds: searching for collision ---")

            try:
                t0 = time.time()
                ar = sequential_attack(
                    num_rounds=num_rounds,
                    solver_name="cadical153",
                    timeout_per_char=60,
                    max_characteristics=16,
                    hash_function=hash_name,
                )
                total_time = time.time() - t0

                if ar.success and ar.m1_words and ar.m2_words:
                    m1 = ar.m1_words
                    m2 = ar.m2_words
                    diff = xor_diff_words(m1, m2)
                    hw = hamming_weight_words(diff)

                    # Compute actual hashes
                    try:
                        if big_endian:
                            m1_bytes = struct.pack(f'>{len(m1)}I', *[w & 0xFFFFFFFF for w in m1])
                            m2_bytes = struct.pack(f'>{len(m2)}I', *[w & 0xFFFFFFFF for w in m2])
                        else:
                            m1_bytes = struct.pack(f'<{len(m1)}I', *[w & 0xFFFFFFFF for w in m1])
                            m2_bytes = struct.pack(f'<{len(m2)}I', *[w & 0xFFFFFFFF for w in m2])

                        h = hash_cls(num_rounds=num_rounds)
                        hash1 = h.hash(m1_bytes).hex()
                        hash2 = h.hash(m2_bytes).hex()
                        verified = (hash1 == hash2 and m1 != m2)
                    except Exception as e:
                        hash1 = f"error: {e}"
                        hash2 = f"error: {e}"
                        verified = False

                    entry = {
                        "hash_function": hash_name,
                        "rounds": num_rounds,
                        "found": True,
                        "time": round(total_time, 4),
                        "M1": words_to_hex(m1),
                        "M2": words_to_hex(m2),
                        "XOR_diff": words_to_hex(diff),
                        "hamming_weight": hw,
                        "hash1": hash1,
                        "hash2": hash2,
                        "verified": verified,
                        "attempts": ar.characteristics_tried,
                    }

                    print(f"  COLLISION FOUND in {total_time:.2f}s!")
                    print(f"  M1 = [{', '.join(words_to_hex(m1)[:4])}...]")
                    print(f"  M2 = [{', '.join(words_to_hex(m2)[:4])}...]")
                    print(f"  Hash1 = {hash1[:32]}...")
                    print(f"  Hash2 = {hash2[:32]}...")
                    print(f"  Hamming weight of diff = {hw}")
                    print(f"  Verified = {verified}")
                else:
                    entry = {
                        "hash_function": hash_name,
                        "rounds": num_rounds,
                        "found": False,
                        "time": round(total_time, 4),
                        "attempts": ar.characteristics_tried,
                    }
                    print(f"  No collision found in {total_time:.2f}s")

                results["experiment4_collisions"].append(entry)

            except Exception as e:
                print(f"  Error: {e}")
                traceback.print_exc()
                results["experiment4_collisions"].append({
                    "hash_function": hash_name,
                    "rounds": num_rounds,
                    "found": False,
                    "error": str(e),
                })


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    overall_start = time.time()

    print("Starting Chapter 4 Experiments...")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    run_experiment1()
    run_experiment2()
    run_experiment3()
    run_experiment4()

    results["metadata"]["total_runtime"] = round(time.time() - overall_start, 2)

    # Save results
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "docs", "vkr", "chapters", "experiment_data.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*70}")
    print(f"ALL EXPERIMENTS COMPLETE")
    print(f"Total runtime: {results['metadata']['total_runtime']:.1f}s")
    print(f"Results saved to: {output_path}")
    print(f"{'='*70}")
