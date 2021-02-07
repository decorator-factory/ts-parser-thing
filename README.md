# `ts-parser-thing`

Simple functional language implemented in TypeScript.

Examples:

```hs
> 2 + 2
4
> ((+ 2) . (* 3))
((+ 2) . (* 3))
> ((+ 2) . (* 3)) 10
32
> {x: x}
{x: x} where {}
> {x: x}
"hi"
> {x: {y: x}} 1 2
1
> {x: {y: x}} 1
{y: x} where {x: 1}
> "Hello," ++ " " ++ "world!"
"Hello, world!"
> 2 ^ 5
32
> (2 ^) 5
32
> (2 ^)
{_: (((^) 2) _)} where {^: (^)}
> {x: (((^) 2) x)} 5
32
>
```
---

## Installing:
```bash
git clone $THIS_REPO
cd $REPO_FOLDER
npm i
```

## Running tests:
```bash
npm test
```

## Running the REPL:
```bash
npm start
```
