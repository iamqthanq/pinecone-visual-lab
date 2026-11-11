"""CI-only tokenizer fixture: byte tokenizer, explicitly NOT E5, no network/assets."""

from tokenizers import Tokenizer, models, pre_tokenizers, processors

from app.main import create_app
from app.tokenization import TokenizerEngine


def fixture_engine():
    alphabet = sorted(pre_tokenizers.ByteLevel.alphabet())
    vocabulary = {token: i for i, token in enumerate(["[UNK]", "<s>", "</s>", *alphabet])}
    tokenizer = Tokenizer(models.BPE(vocab=vocabulary, merges=[], unk_token="[UNK]"))
    tokenizer.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tokenizer.post_processor = processors.TemplateProcessing(
        single="<s> $A </s>", special_tokens=[("<s>", 1), ("</s>", 2)]
    )
    return TokenizerEngine(tokenizer, fixture=True)


app = create_app(engine_provider=fixture_engine)
