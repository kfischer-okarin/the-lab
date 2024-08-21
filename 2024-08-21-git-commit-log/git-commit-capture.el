; All functions/variables are prefixed with kf- to avoid conflicts with other packages
; Feel free to change the prefix to something else if you like

(defvar kf-log-org-file-location
  "~/log.org"
  "Location of the log.org file.")

(defun kf-org-capture-commit (repository-path branch commit-hash commit-message)
  "Function called via shell script to capture a git commit."
  ; Store arguments in a variable that can be accessed by the template function
  (let ((kf-org-capture-arg (list repository-path branch commit-hash commit-message)))
    (org-capture nil "g")))

(defun kf-org-capture-template-git-commit ()
  "Log entry template for git commits.

This will produce a log entry with the following format:
* [2024-08-21 Wed 14:09] the-lab - main - Revise texts a bit more :Log:Git:
[[orgit-rev:/path/to/the-lab::3a8e981][3a8e981]]

You will need orgit to make the link work."
  (pcase-let ((`(,repository-path ,branch ,commit-hash ,commit-message) kf-org-capture-arg))
    (let ((repository-name (file-name-nondirectory repository-path)))
      (concat "* %U " repository-name " - " branch " - " commit-message " :Log:Git:\n"
              "[[orgit-rev:" repository-path "::" commit-hash "][" commit_hash "]]\n"))))
