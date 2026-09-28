from pathlib import Path
import tarfile,re,json,hashlib
root=Path(__file__).resolve().parents[1]
out=root/"public"/"vendor";out.mkdir(exist_ok=True)
with tarfile.open(root/"artifacts"/"katex.tgz") as tar:
 for m in tar.getmembers():
  if not m.isfile():continue
  name=m.name
  if name in ["package/LICENSE","package/dist/katex.mjs","package/dist/katex-swap.min.css"] or name.startswith("package/dist/fonts/"):
   relative=name.removeprefix("package/dist/") if "/dist/" in name else "LICENSE"
   p=out/"katex"/relative
   if ".." in Path(relative).parts:raise ValueError("unsafe path")
   p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(tar.extractfile(m).read())
with tarfile.open(root/"artifacts"/"noto-serif.tgz") as tar:
 css=tar.extractfile("package/index.css").read().decode()
 files=set(re.findall(r"url\(\.?/?(files/[^)]+)\)",css))
 for name in files|{"LICENSE"}:
  p=out/"noto-serif-sc"/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(tar.extractfile("package/"+name).read())
 p=out/"noto-serif-sc"/"index.css";p.write_text(css)
print("Self-hosted vendor files:",sum(1 for _ in out.rglob("*") if _.is_file()))
print("Font files:",len(files),"total bytes",sum(p.stat().st_size for p in out.rglob("*") if p.is_file()))
