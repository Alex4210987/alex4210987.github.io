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

>This is why looking out for pointer types is not enough to detect escaping variables. Moreover, there can be more situations that justify moving a variable to the heap. Ultimately, this is the compiler's decision. This process is called escape analysis.

## escape analysis
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
$`go` run -gcflags="-m -l" main.go
# command-line-arguments
./main.go:11:2: moved to heap: n
./main.go:18:16: []int{...} escapes to heap
./main.go:33:6: moved to heap: largeArray
./main.go:40:7: func literal escapes to heap
```

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

首先，我们获得她的简化语法树：

![simpified AST](/assets/gitbook/images/ast.jpg)

接下来，我们使用一种简单但是巧妙的算法来进行逃逸分析：



## Reference:

[**Go: Introduction to the Escape Analysis**](https://medium.com/a-journey-with-go/go-introduction-to-the-escape-analysis-f7610174e890)

[**Source file src/cmd/compile/internal/escape/escape.go**](https://tip.golang.org/src/cmd/compile/internal/escape/escape.go)

[**It escaped! How can you know if a variable lives on the stack or the heap, and why should you care?**](https://appliedgo.com/blog/how-to-do-escape-analysis)