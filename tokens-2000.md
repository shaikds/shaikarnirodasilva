# A Short Guide to How Language Models Read Text

## Why tokens matter

When you type a sentence to a language model, the model does not see letters or whole words the way you do. It sees tokens. A token is a small piece of text, and the model has a fixed list of these pieces, called a vocabulary. Common words such as "the" or "house" are usually a single token. Rarer words are split into several pieces, so a long technical term might take four or five tokens. Punctuation, spaces and line breaks count as well.

This matters for three reasons. First, every model has a limit on how many tokens it can hold at once, which is called the context window. Second, the cost of using a model is usually measured in tokens. Third, the way text is split can change how well the model understands a word, especially a name, a number or a word from a language that appears rarely in its training data.

## How text is split

Most modern systems use a method called byte pair encoding. The idea is simple. Start with single characters. Then look through a huge amount of text and find the pair of symbols that appears together most often. Merge that pair into one new symbol. Repeat this thousands of times. After enough rounds, frequent words become single symbols, and frequent word parts, like "ing" or "tion", become symbols too.

Because the process is driven by frequency, the result depends on the text it was built from. A vocabulary built mostly from English will split English words efficiently and may split words from other languages into many small pieces. The same sentence can therefore cost a different number of tokens in different languages, even when the meaning is the same.

## Counting tokens in practice

People often want a quick rule for estimating length. For ordinary English prose, a good rule is that one token is about four characters, or about three quarters of a word. So one hundred words is roughly one hundred and thirty tokens. This rule is only a guide. Code tends to use more tokens per character, because symbols, brackets and indentation each take space. Numbers can be expensive too, since a long number is often cut into groups of a few digits.

If you need an exact count, you must use the same tokenizer the model uses. Different models can split the same text differently, so a count from one tokenizer will not always match another. When precision matters, ask the tool that serves the model, because it can report the real number.

## The context window

The context window is the total amount of text the model can consider in one go. It includes everything: the instructions that set up the conversation, any files or notes that were added, the tools the model may call, your messages, and the replies the model has already written. When the window fills up, something has to give. Older parts may be summarized, trimmed or dropped, and the model may lose track of details from early in the conversation.

A useful habit is to treat the window like a desk. A small desk forces you to put away what you do not need. A large desk lets you spread out, but it is still finite, and a cluttered desk makes it harder to find the one page that matters. Keeping instructions short and relevant leaves more room for the work itself.

## What fills the window

In a coding assistant, the window is rarely empty at the start. Several things are placed there before you say a word. There is a system prompt that explains how the assistant should behave. There are descriptions of the tools it can use, such as reading files, searching, or running commands. Connected services can add their own tool descriptions. A list of available skills may be included, with a line or two about each. Project rules and memory files can be added as well, so the assistant remembers your preferences and conventions.

Each of these items costs tokens. A single tool description might take a hundred tokens, while a long rules file might take thousands. Added together, they can use a large share of the window before the first question is asked. Seeing exactly where the tokens go helps you decide what to keep and what to remove.

## Reading a token map

Imagine the window as a long line, numbered from zero at the start. Each item occupies a stretch of that line. The system prompt might run from zero to ten thousand. The tool descriptions might follow, from ten thousand to thirty thousand. Then come rules, skills and finally the conversation itself. Writing each item as a name with a start and an end, such as "rules file [12,000 to 12,450]", tells you both where it sits and how large it is. The size is simply the end minus the start.

Such a map makes trade-offs visible. If a rarely used skill description takes five hundred tokens, you can ask whether it is worth that space. If a rules file has grown to cover many old decisions, you can trim it. Small savings repeat on every request, so they add up across a long session.

## Why estimates differ from exact counts

There are two ways to learn how many tokens a piece of text uses. One is to estimate locally, using a quick rule or a small built-in table. The other is to send the text to the model provider and ask for the exact count. The local method is fast and free, but it can be off by a few percent or more. The provider method is accurate, but it takes time and may count against usage limits.

Estimates also hide small overheads. When text is wrapped in tags, labels or formatting before it reaches the model, extra tokens appear that the raw text did not have. So the size of a file on disk and the size of that file inside the window are often slightly different. If you want to know the true cost, measure it inside the window, not on disk.

## Tips for saving tokens

Write instructions in plain, direct sentences. Remove repeated advice and old notes that no longer apply. Prefer short examples to long ones. Keep tool and skill lists focused on what the project really uses. Avoid pasting large files when a short excerpt will do. When a conversation grows long, start a fresh one and carry over only a brief summary of the important points.

None of this requires giving up useful context. The goal is not to make the window empty, but to make sure that what fills it is what you actually need. A well-kept window leads to faster replies, lower cost, and answers that stay on topic.

## A small exercise

To get a feel for tokens, take a paragraph you wrote recently and estimate its length with the four-characters rule. Then check the real number with a counter. Notice which words were cheap and which were expensive. Names, unusual spellings and long numbers often cost more than you expect. After a few tries, you will start to sense the size of text at a glance, which makes planning a conversation much easier.

## Closing thought

Tokens are the currency of language models. They set the limit on what the model can remember, the price of each request and the speed of each reply. Understanding them does not require any deep mathematics. It only requires paying attention to what is placed in the window and measuring it honestly. When you can see each item with its start and its end, you can manage the space like any other limited resource, and you can spend it on the things that matter most.

## Frequently asked questions

**Is a token the same as a word?** No. A short common word is often one token, but a long or rare word can be several, and punctuation counts too.

**Do spaces count?** Yes. A space is usually attached to the start of the next word, so it rarely costs a token of its own, but line breaks and indentation do add up, especially in code.

**Why does my count change between tools?** Each model family has its own vocabulary, so the same text can split differently. Always count with the tokenizer that matches the model you are using.

**Can I shrink a long file without losing meaning?** Often, yes. Remove duplicated sentences, shorten headings, and replace long explanations with one clear example. Then measure again to confirm the saving.

**How much room should I leave free?** Leave a comfortable margin for the reply and for any tools the model may call, because the answer itself also needs space inside the window.
