---
title: 关于MySQL函数返回表的问题
author: Alex
date: 2023-12-14
category: tech
layout: post
--- 

之前做作业的时候，有一个题目要求用mysql的`函数`完成一个查询，我写了一下，死活过不了编译，显示有`syntax error`。我从网上抄了好几个语法，都不对，最后一版是这样的。

```sql
DELIMITER //
CREATE FUNCTION get_student_courses(sno_param CHAR(9))
RETURNS TABLE (
    Sname VARCHAR(255),
    Cno INT,
    Grade INT
)
DETERMINISTIC
READS SQL DATA
BEGIN
    RETURN (
        SELECT S_T_U2022xxxxx.Student.Sname, S_T_U2022xxxxx.SC.Cno, S_T_U2022xxxxx.SC.Grade
        FROM S_T_U2022xxxxx.Student
        JOIN S_T_U2022xxxxx.SC ON S_T_U2022xxxxx.Student.Sno = sno_param
    );
END;
//
DELIMITER ;
```

我非常疑惑，明明和网上资料是一样的，为什么不行？我只好硬着头皮去看mysql文档。

在[这里](https://dev.mysql.com/doc/refman/8.0/en/create-procedure.html)，我们可以看到：

>Parameter types and function return types can be declared to use any valid data type

那么有哪些`valid data type`呢？在[这里](https://dev.mysql.com/doc/refman/8.0/en/data-types.html)可以发现，`valid data type`包括：

>MySQL supports SQL data types in several categories: numeric types, date and time types, string (character and byte) types, spatial types, and the JSON data type. 

`stored function`的返回值类型必须是这些类型中的一种。那么我们可以看到，`TABLE`并不在这些类型中，因此我们无法使用`TABLE`作为返回值类型。

还有一种函数类型是`loadable function`，[它](https://dev.mysql.com/doc/refman/8.0/en/create-function-loadable.html)的返回值类型更简单了，只能是`{STRING|INTEGER|REAL|DECIMAL}`.

我认为，我们可以得出结论，就是`mysql`不支持`函数`返回`表`这种操作。为什么呢？我认为，数据库中主要还是把`表`视作一个`数据结构`，而不是一个`数据类型`，过于复杂的`数据结构`不适合作为返回值。

那么，如何实现这一功能呢？可以在`函数`内部完成查询，把结果用字符串的形式返回，例如：

```sql
DELIMITER //

CREATE FUNCTION get_student_courses(sno_param CHAR(9))
RETURNS VARCHAR(2048)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE result VARCHAR(2048);

    SELECT GROUP_CONCAT(CONCAT(S.Sno, ' ', S.Sname, ' ', C.Cno, ' ', C.Cname, ' ', SC.Grade) SEPARATOR '; ')
    INTO result
    FROM Student S
    JOIN SC ON S.Sno = SC.Sno
    JOIN Course C ON SC.Cno = C.Cno
    WHERE S.Sno = sno_param;

    RETURN result;
END //

DELIMITER ;
```

当然，最好的办法就是只在数据库中完成增删查改，对于复杂的操作可以在外部程序中完成，少整些花里胡哨的。

毕竟，不是人人都是`mysql`仙人。