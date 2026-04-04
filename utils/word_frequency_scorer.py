# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "click",
#     "nltk",
# ]
# ///

import nltk
import click
import json

@click.argument('corpus_name', default='reuters')
@click.argument('word_list_file', type=click.File('r'))
@click.option('--output-file', '-o', type=click.File('w'), default='-')
@click.group(invoke_without_command=True)
def score_word_list(word_list_file, corpus_name, output_file):
    word_list = json.load(word_list_file)
    nltk.download(corpus_name)
    corpus = getattr(nltk.corpus, corpus_name)

    freqs = nltk.FreqDist(corpus.words())

    total = 0
    word_freqs = {}
    for word in word_list:
        freq = freqs[word]
        total += freq
        word_freqs[word] = freq

    for word in word_list:
        word_freqs[word] /= total

    json.dump(word_freqs, output_file, indent=2)

if __name__ == '__main__':
    score_word_list()
