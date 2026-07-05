"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CheckIcon from "@mui/icons-material/Check";
import SendIcon from "@mui/icons-material/Send";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import BlockIcon from "@mui/icons-material/Block";
import LockResetIcon from "@mui/icons-material/LockReset";
import BusinessIcon from "@mui/icons-material/Business";
import { MemberData } from "./ProjectTabs";

const PRESET_COLORS = [
  "#0F9D8C", "#6C5CE7", "#E17055", "#00B894",
  "#0984E3", "#FDCB6E", "#E84393", "#636E72",
  "#2D3436", "#D63031", "#00CEC9", "#A29BFE",
];

export default function ProjectDetailsTab({
  projectId,
  projectName: initialName,
  projectColor: initialColor,
  inviteUrl: initialInviteUrl,
  members: initialMembers,
}: {
  projectId: string;
  projectName: string;
  projectColor: string;
  inviteUrl: string | null;
  members: MemberData[];
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor || "#0F9D8C");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [inviteUrl, setInviteUrl] = useState(initialInviteUrl);
  const [copied, setCopied] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [members, setMembers] = useState(initialMembers);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);

  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  const [changeDeptOpen, setChangeDeptOpen] = useState(false);
  const [changeDeptValue, setChangeDeptValue] = useState("");

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  const sortedMembers = [...members].sort((a, b) => {
    if (a.isCurrentUser && !b.isCurrentUser) return -1;
    if (!a.isCurrentUser && b.isCurrentUser) return 1;
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  });

  async function handleSaveProject() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const payload = {
      name: name.trim().toUpperCase(),
      color: color || null,
    };

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let body: { error?: string } = {};
      try {
        body = responseText ? JSON.parse(responseText) : {};
      } catch {
        body = { error: responseText || `Server returned ${response.status}` };
      }

      if (!response.ok) {
        console.error("Save project failed:", response.status, body);
        setSaveError(body.error ?? `Request failed (${response.status}).`);
        return;
      }

      setName(payload.name);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Save project error:", err);
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyInvite() {
    if (!inviteUrl) return;
    const fullUrl = `${window.location.origin}${inviteUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendInvites(e: React.FormEvent) {
    e.preventDefault();
    setSendingInvite(true);
    setInviteError(null);
    setInviteResult(null);

    const emailList = inviteEmails.split(",").map((s) => s.trim()).filter(Boolean);

    const response = await fetch(`/api/projects/${projectId}/invite-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: emailList }),
    });

    setSendingInvite(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setInviteError(body.error ?? "Something went wrong.");
      return;
    }

    const body = await response.json();
    setInviteEmails("");
    if (body.failed?.length) {
      setInviteResult(`Sent, but failed for: ${body.failed.join(", ")}`);
    } else {
      setInviteResult("Invites sent.");
    }
  }

  function handleOpenMenu(e: React.MouseEvent<HTMLElement>, member: MemberData) {
    setMenuAnchor(e.currentTarget);
    setSelectedMember(member);
  }

  function handleCloseMenu() {
    setMenuAnchor(null);
    setSelectedMember(null);
  }

  async function handleBlockMember() {
    if (!selectedMember) return;
    handleCloseMenu();

    const response = await fetch(`/api/projects/${projectId}/members/${selectedMember.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocked: !selectedMember.blocked }),
    });

    if (response.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.id === selectedMember.id ? { ...m, blocked: !selectedMember.blocked } : m))
      );
    }
  }

  function handleOpenResetPassword() {
    setResetPasswordValue("");
    setResetPasswordError(null);
    setResetPasswordOpen(true);
    handleCloseMenu();
  }

  async function handleResetPassword() {
    if (!selectedMember || resetPasswordValue.length < 8) {
      setResetPasswordError("Password must be at least 8 characters.");
      return;
    }

    const response = await fetch(`/api/projects/${projectId}/members/${selectedMember.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resetPassword: resetPasswordValue }),
    });

    if (response.ok) {
      setResetPasswordOpen(false);
    } else {
      setResetPasswordError("Something went wrong.");
    }
  }

  function handleOpenChangeDept() {
    setChangeDeptValue(selectedMember?.department ?? "");
    setChangeDeptOpen(true);
    handleCloseMenu();
  }

  async function handleChangeDept() {
    if (!selectedMember || !changeDeptValue.trim()) return;

    const response = await fetch(`/api/projects/${projectId}/members/${selectedMember.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ department: changeDeptValue }),
    });

    if (response.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.id === selectedMember.id ? { ...m, department: changeDeptValue } : m))
      );
      setChangeDeptOpen(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Card sx={{ boxShadow: "0 4px 16px rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.06)" }}>
        <CardContent sx={{ p: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              flexWrap: { xs: "wrap", md: "nowrap" },
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                flexShrink: 0,
                background: `linear-gradient(135deg, ${color} 0%, ${color}88 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid rgba(0,0,0,0.06)",
              }}
            >
              <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>
                {name.charAt(0).toUpperCase()}
              </Typography>
            </Box>

            <TextField
              label="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="small"
              sx={{ flex: 1, minWidth: { xs: "100%", md: 200 } }}
            />

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {PRESET_COLORS.map((c) => {
                const selected = color === c;
                return (
                  <Box
                    key={c}
                    component="button"
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Select color ${c}`}
                    aria-pressed={selected}
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      bgcolor: c,
                      border: selected ? "2px solid #1A1A2E" : "2px solid rgba(0,0,0,0.08)",
                      boxShadow: selected ? "0 2px 6px rgba(0,0,0,0.20)" : "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                      "&:hover": { transform: "scale(1.15)" },
                    }}
                  >
                    {selected && <CheckIcon sx={{ color: "#fff", fontSize: 14 }} />}
                  </Box>
                );
              })}
            </Box>

            <Button variant="contained" onClick={handleSaveProject} disabled={saving} size="small">
              Save
            </Button>
          </Box>

          {saveError && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{saveError}</Alert>}
          {saveSuccess && <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>Saved.</Alert>}
        </CardContent>
      </Card>

      <Card sx={{ boxShadow: "0 4px 16px rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.06)" }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
            <Typography variant="h6" fontWeight={700}>
              Members
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<PersonAddIcon />}
              onClick={() => setInviteDialogOpen(true)}
            >
              Invite
            </Button>
          </Box>

          {sortedMembers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
              No team members yet.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {sortedMembers.map((member) => (
                <Box
                  key={member.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    py: 1.25,
                    px: 2,
                    borderRadius: 2,
                    bgcolor: member.isCurrentUser
                      ? "rgba(15,157,140,0.06)"
                      : member.blocked
                        ? "rgba(239,68,68,0.05)"
                        : "transparent",
                    border: "1px solid rgba(0,0,0,0.04)",
                    opacity: member.blocked ? 0.7 : 1,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: member.blocked ? "rgba(0,0,0,0.08)" : "#DFF5F2",
                        color: member.blocked ? "text.secondary" : "primary.main",
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {member.firstName?.[0]?.toUpperCase() ?? "?"}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          sx={{
                            textDecoration: member.blocked ? "line-through" : "none",
                            color: member.blocked ? "text.secondary" : "text.primary",
                          }}
                        >
                          {member.firstName} {member.lastName}
                        </Typography>
                        {member.isCurrentUser && (
                          <Chip label="You" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                        )}
                        {member.blocked && (
                          <Chip label="Blocked" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                        )}
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25, flexWrap: "wrap" }}>
                        <Typography variant="caption" color="text.secondary">
                          {member.position}
                        </Typography>
                        {member.department && (
                          <Chip
                            label={member.department}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: 11,
                              bgcolor: "rgba(0,0,0,0.04)",
                              color: "text.secondary",
                              fontWeight: 500,
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>
                  <IconButton size="small" onClick={(e) => handleOpenMenu(e, member)} sx={{ flexShrink: 0 }}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        <MenuItem onClick={handleBlockMember} dense>
          <BlockIcon sx={{ mr: 1, fontSize: 18 }} />
          {selectedMember?.blocked ? "Unblock user" : "Block user"}
        </MenuItem>
        <MenuItem onClick={handleOpenResetPassword} dense>
          <LockResetIcon sx={{ mr: 1, fontSize: 18 }} />
          Reset password
        </MenuItem>
        <MenuItem onClick={handleOpenChangeDept} dense>
          <BusinessIcon sx={{ mr: 1, fontSize: 18 }} />
          Change department
        </MenuItem>
      </Menu>

      <Dialog open={resetPasswordOpen} onClose={() => setResetPasswordOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset password for {selectedMember?.firstName} {selectedMember?.lastName}</DialogTitle>
        <DialogContent>
          <TextField
            label="New password"
            type="password"
            value={resetPasswordValue}
            onChange={(e) => setResetPasswordValue(e.target.value)}
            placeholder="At least 8 characters"
            sx={{ mt: 1 }}
          />
          {resetPasswordError && <Alert severity="error" sx={{ mt: 1, borderRadius: 2 }}>{resetPasswordError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleResetPassword}>Reset</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={changeDeptOpen} onClose={() => setChangeDeptOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change department for {selectedMember?.firstName} {selectedMember?.lastName}</DialogTitle>
        <DialogContent>
          <TextField
            label="Department"
            value={changeDeptValue}
            onChange={(e) => setChangeDeptValue(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeDeptOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleChangeDept} disabled={!changeDeptValue.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Invite team members</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Share this link
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <TextField
                value={inviteUrl ? `${typeof window !== "undefined" ? window.location.origin : ""}${inviteUrl}` : "Loading..."}
                InputProps={{ readOnly: true }}
                size="small"
                fullWidth
              />
              <Button
                variant="outlined"
                onClick={handleCopyInvite}
                disabled={!inviteUrl}
                startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
                sx={{ flexShrink: 0 }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </Box>
          </Box>

          <Box component="form" onSubmit={handleSendInvites}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Or send by email
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <TextField
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                placeholder="name@company.com, another@company.com"
                size="small"
                fullWidth
                multiline
                minRows={2}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={sendingInvite || !inviteEmails.trim()}
                startIcon={<SendIcon />}
                sx={{ flexShrink: 0 }}
              >
                Send
              </Button>
            </Box>
          </Box>

          {inviteError && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{inviteError}</Alert>}
          {inviteResult && <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>{inviteResult}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialogOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
