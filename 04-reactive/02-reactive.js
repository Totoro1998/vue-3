/**
 * 设计一个完善的响应系统
 * ! 但是目前的实现还存在很多缺陷，没有在副作用函数与被操作的目标字段之间建立明确的联系
 */

// 存储副作用函数的桶
const bucket = new Set();
// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// 原始数据
const data = { text: "hello world" };
// 对原始数据的代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
    if (activeEffect) {
      bucket.add(activeEffect);
    }
    return target[key];
  },
  // 拦截设置操作
  set(target, key, newVal) {
    target[key] = newVal;
    // 把副作用函数从桶里取出并执行
    bucket.forEach((fn) => fn());
    return true;
  },
});

// 注册副作用函数
function registerEffect(fn) {
  activeEffect = fn;
  fn();
}
registerEffect(() => {
  document.body.innerText = obj.text;
});

setTimeout(() => {
  obj.text = "hello Vue3";
}, 1000);

// ! 但如果我们再对这个系统稍加测试，例如在响应式数据 obj 上设置一个不存在的属性时:
setTimeout(() => {
  obj.text = "hello Vue3";
}, 2000);
