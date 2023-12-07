---
title: How to go across the gfw on WSL2 elegantly?
author: Alex
date: 2023-7-24
category: tech
layout: post
---

Unlike WSL1, WSL2 use different network other than the original Windows network. They have differnt IP address and DNS server. Windows offer an Ethernet NIC for WSL2, as shown below:

```
以太网适配器 vEthernet (WSL):

   连接特定的 DNS 后缀 . . . . . . . :
   本地链接 IPv6 地址. . . . . . . . : **
   IPv4 地址 . . . . . . . . . . . . : ***
   子网掩码  . . . . . . . . . . . . : 255.255.240.0
   默认网关. . . . . . . . . . . . . :
```

so some extra work should be done to make vpn work on WSL2.

## set proxy for WSL2

it's easy: 

```
hostip=$(cat /etc/resolv.conf | grep -oP '(?<=nameserver\ ).*' | head -1)
export https_proxy="http://${hostip}:7890"
export http_proxy="http://${hostip}:7890"
export all_proxy="socks5://${hostip}:7890"
```

in the configuration file(`~/.zshrc` for me), add the above code to the end of the file.

first line is to get the host ip address form resolv.conf, where lies the DNS server address.

second and third line is to set proxy for http and https, the last line is to set proxy for socks5.

you may wonder why we use `head -1`. It's because there may be more than one ip address in the file, and we only need one. that will be explained later.

PS: according to [@shenglisl](https://github.com/shenglisl), if you do things above, you should **NOT** use "TUN Mode" and vice versa.

## set nameserver

okay, now we can access websites beyond the wall. but when we try `git push` we still get name resolution error. 

if we try nslookup, wikipedia for example:

```
nslookup https://zh.wikipedia.org/                                 ⏎ ✖ ✹ ✭
;; communications error to ***#53: timed out
;; communications error to ***#53: timed out
;; communications error to ***#53: timed out
;; no servers could be reached
```

and if i ping this nameserver, it also appear to be unreachable.

after some experiments, i discover that's because `clash for windows` has a shitty nameserver and i am using it as long as the application is running. 

i don't know why the nameserver is such a piece of crap but i can still acess the internet. 
i guess maybe i don't have the permission to use it? no idea.

anyway, i know how to fix it. Just add a new nameserver to `/etc/resolv.conf`. but first we should edit the `/etc/wsl.conf` so our changes won't be overwritten.

``` 
[network]
generateResolvConf = false
```

then add the nameserver to `/etc/resolv.conf`:

```
nameserver 8.8.8.8
```

here we use google's nameserver, you can use any nameserver you like.

now everything is fixed and we can use git and other tools normally.