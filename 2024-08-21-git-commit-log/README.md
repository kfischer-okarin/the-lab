# Git Commit Log

[![Japanese README](https://img.shields.io/badge/lang-ja-red)](./README.ja.md)

Logs all git commits into an org file.

## Background
I often struggle to remember what I did during a workday, but I need to recall my activities for
retrospectives, 1-on-1 meetings, and similar purposes. However, I find it difficult to take detailed notes
consistently. To address this, I thought that it would be best to automatically log my work.

Since my primary activity — programming — regularly involves committing to Git repositories, I began by logging all my
Git commits as an effective first step.

## Usage

1. Make sure your Emacs Server is running (for example by adding `(server-start)` to your Emacs configuration).

2. Add the definitions in [`git-commit-capture.el`](./git-commit-capture.el) to your Emacs configuration.

3. Add following capture template to your `org-capture-templates` variable.

   ```elisp
   ("g" "Git Commit" entry
    (file+olp+datetree kf-log-org-file-location)
    (function kf-org-capture-template-git-commit)
    :immediate-finish t
    :empty-lines 1)
   ```

   Make sure the letter of the template and the letter specified in `kf-org-capture-commit` match.

4. Prepare a global git hook directory if necessary.

   Example:
   ```sh
   mkdir -p ~/.config/git/hooks
   git config --global core.hooksPath ~/.config/git/hooks
   ```

5. Store the [`org-capture-last-commit`](./org-capture-last-commit) script somewhere

6. Add following line to your global `post-commit` git-hook script (make sure to specify the actual path to your script
   location).

   ```sh
   org-capture-last-commit || true # ignore errors
   ```
