// The copy key's text. USMLE_support/tests/qb_adapter_test.mjs expects the same strings byte for byte,
// so QB Support and UW Support put identical text on the clipboard.
import assert from "node:assert/strict";
import { copyText } from "../src/core/qbCopy.ts";

const two = {
  stem: "23歳の男性．\n腹痛を主訴に来院した．",
  choices: [{ letter: "a", text: "直腸指診を行う．" }, { letter: "b", text: "CT を撮る．" }],
  answered: false, answer: "", selected: "", explanation: "",
};
assert.equal(copyText(two), "23歳の男性．\n腹痛を主訴に来院した．\n\na. 直腸指診を行う．\nb. CT を撮る．\n\n上記について絶妙なヒントをください。今の考察は以下です。\n・");
assert.equal(copyText({ ...two, answered: true, answer: "a", selected: "b", explanation: "虫垂炎を疑う．" }),
  "23歳の男性．\n腹痛を主訴に来院した．\n\na. 直腸指診を行う．\nb. CT を撮る．\n\n正解: a（自分の解答: b）\n\n解説:\n虫垂炎を疑う．");
assert.equal(copyText({ ...two, answered: true, answer: "c, e", selected: "c, e" }),
  "23歳の男性．\n腹痛を主訴に来院した．\n\na. 直腸指診を行う．\nb. CT を撮る．\n\n正解: c, e");
console.log("copy_text.test passed");
