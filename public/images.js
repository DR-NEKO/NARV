// Attachments belong to a manuscript/version, never to a public account identifier.
const dataImage = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const shortImage = /!\[([^\]]*)\]\(narv-image:(img-\d+)\)/g;
const embeddedImage = /!\[([^\]]*)\]\((data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)\)/g;
export function validImageSource(src) {
  return typeof src === "string" && dataImage.test(src) && src.length <= 350000;
}
export function nextImageId(images = {}) {
  let n = 1;
  while (Object.hasOwn(images, "img-" + n)) n++;
  return "img-" + n;
}
export function compactImages(content = "", images = {}) {
  const result = {...images};
  const text = String(content).replace(embeddedImage, (_, caption, src) => {
    let id = Object.keys(result).find(key => /^img-\d+$/.test(key) && result[key] === src);
    if (!id) { id = nextImageId(result); result[id] = src; }
    return "![" + caption + "](narv-image:" + id + ")";
  });
  return {content: text, images: result};
}
export function imageReferences(content = "") {
  return [...String(content).matchAll(shortImage)].map(m => ({
    id: m[2], caption: m[1], text: m[0], index: m.index
  }));
}
export function referencedImages(content, images = {}) {
  const selected = {};
  for (const ref of imageReferences(content)) {
    if (validImageSource(images[ref.id])) selected[ref.id] = images[ref.id];
  }
  return selected;
}
export function prepareImages(content, images = {}, submitting = false) {
  const compact = compactImages(content, images), refs = imageReferences(compact.content);
  if ((compact.content.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length > 3)
    throw Error("每篇最多 3 张图片。");
  for (const {id} of refs) {
    if (Object.hasOwn(compact.images, id) && !validImageSource(compact.images[id]))
      throw Error("图片格式不受支持或压缩后仍过大，请重新插入。");
    if (submitting && !validImageSource(compact.images[id]))
      throw Error("正文中的图片附件缺失，请移除对应标记或重新插入图片。");
  }
  return {content: compact.content, images: referencedImages(compact.content, compact.images)};
}
export function expandImages(content, images = {}) {
  return String(content || "").replace(shortImage, (_, caption, id) =>
    validImageSource(images[id]) ? "![" + caption + "](" + images[id] + ")" :
      "[图片附件缺失：" + (caption || id) + "]");
}
