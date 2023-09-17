---
title: 栈逃逸分析初步
author: Alex
date: 2023-9-04
category: tech
layout: post
--- 

函数调用中，局部变量会储存在调用栈中。但有时候，局部变量从栈逃逸至堆中。

本篇文章中，我们将讨论栈逃逸的原因和各种可能情况，并介绍一种简单但巧妙地分析算法，并尝试用[`rust`](https://www.rust-lang.org/)实现这种算法以用于[`pivot lang`](https://lang.pivotstudio.cn/)

## heap vs stack

`堆`(heap)是一种动态分配内存的方式，它的内存位置是离散的，大小不定，需要通过GC进行回收。而`栈`(stack)是一种静态分配内存的方式，它的内存位置是连续的，大小固定。

(btw,中文中喜欢把stack称为堆栈，很令人困惑。本文中，我们使用stack称呼栈。)

因此，我们很容易看出：如果可以的话，在函数调用中，我们应该尽量使用栈而不是堆，因为栈的内存分配速度更快，而且不需要GC。

然而，在一些情况下，函数局部变量的生命周期会比调用栈上的函数帧更长。这导致部分局部变量被移动(or 逃逸)到堆上。而如上所述，需要手动或者使用GC处理堆上的变量，因此有必要堆逃逸的变量进行判断、分析。

## why escape?

我们先来看一个例子：

```go
func b() *int {
    m := 1
    return &m
}
```

这段代码中，如果将`m`存储在栈中，那么当函数`b`返回时，`m`将会被销毁，因此`b`返回的指针将会指向一个不存在的变量。这是不允许的。

所以，编译器有必要识别出这些需要逃逸的变量，并将其存储在堆中。

可能逃逸的并不只有显式的指针，还有一些例子。我直接复制了：

>## Hidden pointers
>Several data types contain hidden pointers, including:

>- Slices
>- Maps
>- Structs with pointer fields
>- Function literals

在`Go`中，我们可以通过`-gcflags '-m'`来查看编译器对代码的分析结果。例如：

```go
package main

// returnValue returns a value over the call stack
func returnValue() int {
    n := 42
    return n
}

// returnPointer returns a pointer to n, and n is moved to the heap
func returnPointer() *int {
    n := 42  // --- line 11 ---
    return &n
}

// returnSlice returns a slice that escapes to the heap,
// because the slice header includes a pointer to the data.
func returnSlice() []int {
    slice := []int{42} // --- line 18 ---
    return slice
}

// returnArray returns an array that does not escape to the heap,
// because arrays need no header for tracking length and capacity
// and are always copied by value.
func returnArray() [1]int {
    return [1]int{42}
}

// largeArray creates a ridiculously large array that escapes to the heap,
// even though the array itself is not returned
// and thus does not outlive the function.
func largeArray() int {
    var largeArray [100000000]int  // --- line 33 ---
    largeArray[42] = 42
    return largeArray[42]
}

// returnFunc() returns a function that escapes to the heap
func returnFunc() func() int {
    f := func() int {  // --- line 40 ---
        return 42
    }
    return f
}

func main() {
    a := returnValue()
    p := *returnPointer()
    s := returnSlice()
    arr := returnArray()
    la := largeArray()
    f := returnFunc()()

    // Consume the variables to avoid compiler warnings.
    // I don't use Printf/ln because this produces a lot 
    // of extra escape messages.
    if a+p+s[0]+arr[0]+la+f == 0 {
        return
    }
}
```
运行结果是：

```bash
$ go run -gcflags="-m -l" main.go
# command-line-arguments
./main.go:11:2: moved to heap: n
./main.go:18:16: []int{...} escapes to heap
./main.go:33:6: moved to heap: largeArray
./main.go:40:7: func literal escapes to heap
```

## escape analysis

那么这种结果是怎么获得的呢？我们来看看Go是如何进行逃逸分析的。

以这段代码为例：

```go   
func main() {
   num := getRandom()
   println(*num)
}

//go:noinline
func getRandom() *int {
   tmp := rand.Intn(100)

   return &tmp
}
```

我们获得她的简化语法树，作为分析的基础。

![simpified AST](/assets/gitbook/images/ast.jpg)


接着，我们要确定逃逸点，也就是那些可能逃逸的变量。逃逸点主要有以下几种：

>- Any returned value outlives the function since the called function does not know the value.
>- Variables declared outside a loop outlive the assignment within the loop
>- Variables declared outside a closure outlive the assignment within the closure

## optimization

然而，并不是所有的逃逸点都需要我们将某些变量移动到堆上。比如说这段代码：
```go
package main

func addOne(value int) int {
	return value + 1
}

func main() {
	value := 1
	print(addOne(value))
}
```
显然没有必要将任何变量移动到堆上。因为除了返回值，其他变量都是在函数调用结束后销毁的。

我们使用一种`有向权值图`的方法进行优化。以这段代码为例：

```go
func main() {
   n := getAnyNumber()
   println(*n)
}

//go:noinline
func getAnyNumber() *int {
   l := new(int)
   *l = 42

   m := &l
   n := &m
   o := **n

   return o
}
```

我们把一次`赋值`看作一条边，其中`解引用`(dereferencing)的赋值权值为`1`，`取地址`(referencing)的赋值权值为`-1`。那么我们可以得到这样一张图：

```
variable o has a weight of 0, o has an edge to n
variable n has a weight of 2, n has an edge to m
variable m has a weight of 1, m has an edge to l
variable l has a weight of 0, l has an edge to new(int)
variable new(int) has a weight of -1
```

由于对于地址不能再次取地址，因此最低的权值为`-1`。也就是说，如果一个变量的权值为`-1`，那么我们需要将其移动到堆上。

`loop`和`function literal`的优化方法与此类似.(to be appended)

## apply to `pivot lang`

我们并不需要自己生成全部`AST`，而是根据用户对于接口的调用生成简化版的`AST`，接着进行权值图分析。

```rust
use std::io;
fn main() i64 {
    let result = returnPointer(10);
    println!(*result);
    return 0;
}
fn returnPointer(n: i64) *i64 {
    let m = n;
    let 
    return &m;
}
```

我们所需要获取的语法信息由三个部分：`变量`、`赋值`和`作用域`。

当用户调用我们的接口时，我们需要：

- 定义出现过的`作用域`，返回一个`scope id`：`new_scope(main)`、`new_scope(returnPointer)`。
  
- 定义出现过的`变量`及其所在的`作用域`，返回一个`var id`：`new_var(m, returnPointer)`、`new_var(n, returnPointer)`、`new_var(result, main)`。
  
- 定义出现过的`赋值`，包括`左值`、`右值`、`权值`和`作用域`，返回一个`assign id`：`new_assign(m, n, 0, returnPointer)`、`new_assign(result, m, 0, main)`。
  
- 定义出现过的`函数调用`，包括`函数名`、`参数`和`作用域`，返回一个`call id`：`new_call(returnPointer, 10, main)`。

- 最后，给出`逃逸点`的表达式：`escape(result)`。

现在，我们就可以根据如上的算法进行分析。

## Reference:

[**Go: Introduction to the Escape Analysis**](https://medium.com/a-journey-with-go/go-introduction-to-the-escape-analysis-f7610174e890)

[**Source file src/cmd/compile/internal/escape/escape.go**](https://tip.golang.org/src/cmd/compile/internal/escape/escape.go)

[**It escaped! How can you know if a variable lives on the stack or the heap, and why should you care?**](https://appliedgo.com/blog/how-to-do-escape-analysis)

[**my repo**](https://github.com/Pivot-Studio/pivot-lang-escape-analyzer)[1]

1. It may be completed much later since I've just started learning rust. Sorry for that.