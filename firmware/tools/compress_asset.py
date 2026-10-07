"""Deterministic HTTP gzip encoding; source bytes are unchanged on decoding."""
import gzip,sys
from pathlib import Path
source,target=map(Path,sys.argv[1:])
data=source.read_bytes();packed=gzip.compress(data,compresslevel=9,mtime=0)
assert gzip.decompress(packed)==data
target.write_bytes(packed)
