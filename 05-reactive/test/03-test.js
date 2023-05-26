// !get和set中的receiver参数详解

/**
 * obj：要获取属性值的目标对象。
 * propertyKey：要获取的属性的键，可以是一个字符串或符号。
 * receiver（可选）：可选的接收器对象，用于指定 getter 方法中的 this 值。
 */

let obj = {
  a: 1,
  get b() {
    return this.a;
  },
};

const test = Reflect.get(obj, "a", { a: 3 });
const test2 = Reflect.get(obj, "b", { a: 3 });
console.log(test);
console.log(test2);
