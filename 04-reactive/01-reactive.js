/**
 * 设计一个微型响应系统
 * ! 但是目前的实现还存在很多缺陷，例如我们直接通过名字（effect）来获取副作用函数，这种硬编码的方式很不灵活。
 */

// 存储副作用函数的桶
const bucket = new Set();
// 原始数据
const data = { text: "hello world" };
// 对原始数据的代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数 effect 添加到存储副作用函数的桶中
    bucket.add(effect);
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

function effect() {
  document.body.innerText = obj.text;
}

effect();

setTimeout(() => {
  obj.text = "hello Vue3";
}, 1000);
