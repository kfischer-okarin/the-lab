# Git Commit Log

[![English README](https://img.shields.io/badge/lang-en-blue)](./README.md)

Gitのすべてのコミットをorgファイルに記録します。

## 背景
僕は、仕事中に何をやったかを思い出すのに苦労することがよくありますが、振り返りや1on1などの場面では、自分の活動を思い出さ
ないといけません。しかし、詳細なメモを一貫して取るのは難しいなと感じています。この問題に対処するために、自分の作業を自動
的に記録するのが一番いいのではないかと考えました。

僕の作業の大半はプログラミングで、それは定期的にGitリポジトリへのコミットを伴うので、まずはGitの全コミットを記録することから
始めてみました。

## 使い方

1. Emacsサーバーが動いていることを確認してください。Emacs設定に `(server-start)` を追加することで、起動されます。

2. [`git-commit-capture.el`](./git-commit-capture.el) の定義をEmacs設定に含めてください。

3. 以下のテンプレートを `org-capture-templates` 変数に追加してください:

   ```elisp
   ("g" "Git Commit" entry
    (file+olp+datetree kf-log-org-file-location)
    (function kf-org-capture-template-git-commit)
    :immediate-finish t
    :empty-lines 1)
   ```

   テンプレートの文字が `kf-org-capture-commit` に指定された文字と一致していることを確認してください。

4. 必要に応じて、グローバルGitフックディレクトリを準備してください:

   例:
   ```sh
   mkdir -p ~/.config/git/hooks
   git config --global core.hooksPath ~/.config/git/hooks
   ```

5. [`org-capture-last-commit`](./org-capture-last-commit) スクリプトを適切な場所に保存してください。

6. `org-capture-last-commit` スクリプトの正しいパスを指定して、以下の行をグローバル `post-commit` Gitフックスクリプトに
   追加してください:

   ```sh
   org-capture-last-commit || true # ignore errors
   ```
