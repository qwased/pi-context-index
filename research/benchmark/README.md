# Benchmark (local only)

Synthetic 10K-message / 50 MB mixed-session benchmark for the 0.1.0 targets.
It builds a temporary in-memory session, measures the cold capsule, cold
search, hot search/list/read and a hot capsule, then writes one JSON result
under `research/benchmark/out/` (git-ignored).

```sh
bun research/benchmark/benchmark.ts
# smaller smoke run
bun research/benchmark/benchmark.ts --turns 800
```

The fixture is ASCII synthetic text with 2,500 turns x (user 400 chars +
tool call + 18,100-char tool result + 1,500-char assistant text). It never
reads a real session or agent directory. `profile.ts` is a small stage
profiler kept to reproduce the cold-search breakdown (capture, projection,
fields, chunking, BM25).

Targets: cold capsule/search on the 10K/50MB fixture <= 2 s; hot query/read
<= 200 ms. The benchmark also checks cold and hot searches return the same
bytes and the two capsules are byte-identical, so a cache cannot change
ordering or output.
