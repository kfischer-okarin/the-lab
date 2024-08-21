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

1. Ensure that your Emacs Server is running. You can do this by adding `(server-start)` to your Emacs configuration.

2. Include the definitions from [`git-commit-capture.el`](./git-commit-capture.el) in your Emacs configuration.

3. Add the following capture template to your `org-capture-templates` variable:

   ```elisp
   ("g" "Git Commit" entry
    (file+olp+datetree kf-log-org-file-location)
    (function kf-org-capture-template-git-commit)
    :immediate-finish t
    :empty-lines 1)
   ```

   Ensure that the template's letter matches the letter specified in `kf-org-capture-commit`.

4. If necessary, set up a global Git hook directory:

   Example:
   ```sh
   mkdir -p ~/.config/git/hooks
   git config --global core.hooksPath ~/.config/git/hooks
   ```

5. Store the [`org-capture-last-commit`](./org-capture-last-commit) script in a suitable location.

6. Add the following line to your global `post-commit` Git hook script, making sure to specify the correct path to your
   `org-capture-last-commit` script:

   ```sh
   org-capture-last-commit || true # ignore errors
   ```
