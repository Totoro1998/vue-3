/**
 * 设计一个完善的响应系统
 * 分支切换与cleanup（删除遗留的副作用函数）
 * 每次副作用函数执行时，我们可以先把它从所有与之关联的依赖集合中删除
 * 当副作用函数执行完毕后，会重新建立联系，但在新的联系中不会包含遗留的副作用函数
 */

// 存储副作用函数的桶
const bucket = new WeakMap();
// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// 原始数据
const data = { text: "hello world", ok: true };

// 对原始数据的代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
    track(target, key);
    return target[key];
  },
  // 拦截设置操作
  set(target, key, newVal) {
    target[key] = newVal;
    // 把副作用函数从桶里取出并执行
    trigger(target, key);
  },
});

function track(target, key) {
  if (!activeEffect) return;
  let targetMap = bucket.get(target);
  if (!targetMap) {
    targetMap = new Map();
    bucket.set(target, targetMap);
  }
  let effectSet = targetMap.get(key);
  if (!effectSet) {
    effectSet = new Set();
    targetMap.set(key, effectSet);
  }
  // 把当前激活的副作用函数添加到依赖集合effectSet中
  effectSet.add(activeEffect);
  // effectSet 就是一个与当前副作用函数存在联系的依赖集合
  // 只有在每次track时才将其添加到 activeEffect.effectSets 数组中
  activeEffect.effectSets.push(effectSet);
}

function trigger(target, key) {
  const targetMap = bucket.get(target);
  if (!targetMap) {
    return;
  }
  const effectSet = targetMap.get(key);
  const effectsToRun = new Set(effectSet);
  effectsToRun.forEach((effectFn) => effectFn());
  //   effectSet && effectSet.forEach((fn) => fn());
}

// 注册副作用函数
function registerEffect(fn) {
  const effectFn = () => {
    // 在trigger中每运行一次副作用函数后就调用cleanup进行清除
    // 然后在track中重新添加副作用
    cleanup(effectFn);
    // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
    activeEffect = effectFn;
    fn();
  };
  effectFn.effectSets = []; // effectSets用来存储所有包含当前副作用函数的依赖集合
  effectFn();
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.effectSets.length; i++) {
    // effectSet是依赖集合
    const effectSet = effectFn.effectSets[i];
    // 将effectFn从依赖集合中删除
    effectSet.delete(effectFn);
  }
  // 最后需要充值effectFn.deps数组
  effectFn.effectSets.length = 0;
}

registerEffect(() => {
  console.log("effect run");
  document.body.innerText = obj.ok ? obj.text : "not";
});

setTimeout(() => {
  obj.ok = false;
  setTimeout(() => {
    obj.ok = true;
  }, 1000);
}, 1000);
