/**
 * 设计一个完善的响应系统
 * ! 不支持嵌套
 * 我们用全局变量 activeEffect 来存储通过 effect 函数注册的副作用函数，这意味着同一时刻 activeEffect 所存储的副作用函数只能有一个。
 * 当副作用函数发生嵌套时，内层副作用函数的执行会覆盖 activeEffect 的值，并且永远不会恢复到原来的值。
 * 这时如果再有响应式数据进行依赖收集，即使这个响应式数据是在外层副作用函数中读取的，它们收集到的副作用函数也都会是内层副作用函数，这就是问题所在。
 */

// 存储副作用函数的桶
const bucket = new WeakMap();
// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// 原始数据
const data = { foo: "hello world", bar: true };

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

  const effectsToRun = new Set();
  effectSet && effectSet.forEach((effectFn) => effectsToRun.add(effectFn));
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

let temp1, temp2;

registerEffect(function effectFn1() {
  console.log("effectFn1执行");
  //effectFn2 的执行先于对字段 obj.foo 的读取操作
  registerEffect(function effectFn2() {
    console.log("effectFn2执行");
    temp2 = obj.bar;
  });
  temp1 = obj.foo;
});

// 在这种情况下，我们希望当修改 obj.foo 时会触发 effectFn1 执行。
// 由于 effectFn2 嵌套在 effectFn1 里，所以会间接触发 effectFn2 执行.
// 而当修改 obj.bar 时，只会触发 effectFn2 执行。
obj.foo = "test";

//01 'effectFn1 执行'
//02 'effectFn2 执行'
//03 'effectFn2 执行'
// !effectFn1并没有重新执行，反而使得 effectFn2 重新执行了
