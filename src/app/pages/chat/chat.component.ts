import {
  Component, OnInit, OnDestroy, inject, signal,
  ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { Chat, Message, CallSession } from '../../models/chat.model';

type ChatFilter = 'all' | 'unread' | 'favorites' | 'groups';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesEnd') messagesEnd!: ElementRef;
  @ViewChild('msgInput') msgInput!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('imageInput') imageInput!: ElementRef;
  @ViewChild('audioInput') audioInput!: ElementRef;
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;

  private chatService = inject(ChatService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  // ─── STATE ─────────────────────────────────────────────────────────────────
  get myUid(): string {
    return this.auth.currentUid || this.auth.currentUserId || '';
  }

  allChats: Chat[] = [];       // todos los chats sin filtrar
  chats: Chat[] = [];          // chats que se muestran (filtrados)
  activeChatId: string | null = null;
  activeChat: Chat | null = null;
  messages: Message[] = [];
  partnerProfiles: { [uid: string]: any } = {};

  newMessage = '';
  isLoading = false;
  isSending = false;

  // ─── FILTROS ───────────────────────────────────────────────────────────────
  activeFilter: ChatFilter = 'all';

  // ─── MENÚ SIDEBAR (3 puntos) ───────────────────────────────────────────────
  showSidebarMenu = false;

  // ─── MENÚ HEADER CHAT (3 puntos) ──────────────────────────────────────────
  showChatMenu = false;

  // ─── PANELS EXISTENTES ────────────────────────────────────────────────────
  showNewChat = false;
  showGroupModal = false;
  showEmojiPicker = false;
  showAttachMenu = false;
  showGifPicker = false;
  showStickerPicker = false;
  showDeleteModal = false;
  showViewOnceModal = false;

  // ─── BÚSQUEDA DENTRO DEL CHAT ─────────────────────────────────────────────
  showChatSearch = false;
  chatSearchQuery = '';
  chatSearchResults: Message[] = [];
  chatSearchIndex = 0;

  // ─── VACIAR / ELIMINAR CHAT ───────────────────────────────────────────────
  showClearChatModal = false;
  showDeleteChatModal = false;
  showLeaveGroupModal = false;
  showDeleteGroupModal = false;

  // ─── BÚSQUEDA USUARIOS ────────────────────────────────────────────────────
  userSearchQuery = '';
  userSearchResults: any[] = [];
  isSearchingUsers = false;

  // ─── GRUPO ────────────────────────────────────────────────────────────────
  groupName = '';
  groupSearchQuery = '';
  groupSearchResults: any[] = [];
  isSearchingGroupUsers = false;
  selectedMembers: any[] = [];
  groupStep: 1 | 2 = 1;   // paso 1 = buscar miembros, paso 2 = nombre y crear

  // ─── REPLY / EDIT ─────────────────────────────────────────────────────────
  replyingTo: Message | null = null;
  editingMessageId: string | null = null;
  editingText = '';

  // ─── CONTEXT MENU ─────────────────────────────────────────────────────────
  contextMenuMsg: Message | null = null;
  contextMenuX = 0;
  contextMenuY = 0;

  // ─── DELETE MESSAGE MODAL ─────────────────────────────────────────────────
  deleteTargetMsg: Message | null = null;

  // ─── VIEW ONCE ────────────────────────────────────────────────────────────
  viewOnceTargetMsg: Message | null = null;
  newMessageViewOnce = false;

  // ─── UPLOAD ───────────────────────────────────────────────────────────────
  uploadProgress: number | null = null;
  isUploading = false;

  // ─── GIFs ─────────────────────────────────────────────────────────────────
  gifSearchQuery = '';
  gifResults: any[] = [];
  isSearchingGifs = false;
  private GIPHY_KEY = 'YOUR_GIPHY_API_KEY';

  // ─── STICKERS ─────────────────────────────────────────────────────────────
  stickerCategories = [
    { label: '😸 Gatos',  stickers: ['https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif', 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif'] },
    { label: '🐶 Perros', stickers: ['https://media.giphy.com/media/mCRJDo24UvJMA/giphy.gif', 'https://media.giphy.com/media/3ohzdYJK1wAdPWVk88/giphy.gif'] },
    { label: '🎉 Fiesta', stickers: ['https://media.giphy.com/media/g9582DNuQppxC/giphy.gif', 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif'] },
  ];

  // ─── AUDIO RECORDING ──────────────────────────────────────────────────────
  isRecording = false;
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];
  recordingTime = 0;
  private recordingTimer: any;

  // ─── WEBRTC ───────────────────────────────────────────────────────────────
  activeCall: CallSession | null = null;
  callId: string | null = null;
  isCallMinimized = false;
  callDuration = 0;
  private callTimer: any;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private callSub: Subscription | null = null;
  private signalSub: Subscription | null = null;
  private processedSignals = new Set<string>();

  // ─── EMOJIS ───────────────────────────────────────────────────────────────
  quickEmojis = ['❤️', '😂', '👍', '😮', '😢', '🙏'];
  emojiList = ['😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👎','❤️','🔥','🎉','👏','🙏','💯','😊','🤣','😘','🥹','💀','🫡','👀','🤯','🥳','🫶','😤','🥺','😴','🤩'];

  private subs: Subscription[] = [];
  private shouldScrollBottom = false;

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // ─── LIFECYCLE ────────────────────────────────────────────────────────────
  ngOnInit() {
    const authSub = this.auth.user$.subscribe(user => {
      if (!user) return;
      authSub.unsubscribe();

      this.loadChats();

      const chatId = this.route.snapshot.queryParamMap.get('chatId');
      if (chatId) this.openChat(chatId);

      const userId = this.route.snapshot.queryParamMap.get('userId');
      if (userId) this.startDMWithUser(userId);

      this.listenIncomingCalls();
    });
    this.subs.push(authSub);
  }

  ngAfterViewChecked() {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
    if (this.localVideo?.nativeElement && this.localStream && !this.localVideo.nativeElement.srcObject) {
      this.localVideo.nativeElement.srcObject = this.localStream;
    }
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.endCall(true);
    clearInterval(this.recordingTimer);
  }

  // ─── CERRAR MENÚS ──────────────────────────────────────────────────────────
  closeAllMenus() {
    this.showSidebarMenu = false;
    this.showChatMenu = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHATS Y FILTROS
  // ═══════════════════════════════════════════════════════════════════════════

  loadChats() {
    const sub = this.chatService.getMyChats().subscribe(async chats => {
      this.allChats = chats;
      for (const chat of chats) await this.loadPartnerProfiles(chat);
      this.applyFilter(this.activeFilter);
      this.cdr.detectChanges();
    });
    this.subs.push(sub);
  }

  async loadPartnerProfiles(chat: Chat) {
    for (const uid of chat.members) {
      if (uid !== this.myUid && !this.partnerProfiles[uid]) {
        const profile = await this.chatService.getUserProfile(uid);
        if (profile) this.partnerProfiles[uid] = profile;
      }
    }
  }

  setFilter(filter: ChatFilter) {
    this.activeFilter = filter;
    this.applyFilter(filter);
  }

  applyFilter(filter: ChatFilter) {
    switch (filter) {
      case 'unread':
        // Chats cuyo lastMessage existe y el usuario no ha leído (simplificado con lastUpdated)
        this.chats = this.allChats.filter(c => this.getUnreadCount(c) > 0);
        break;
      case 'favorites':
        this.chats = this.allChats.filter(c => (c as any).favorite === true);
        break;
      case 'groups':
        this.chats = this.allChats.filter(c => c.type === 'group');
        break;
      default:
        this.chats = [...this.allChats];
    }
  }

  getUnreadCount(chat: Chat): number {
    // Retorna 1 si hay lastMessage y no es del usuario actual como indicador simple
    // (el conteo real vendría de los mensajes; aquí usamos flag si existe)
    return (chat as any).unreadCount || 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABRIR CHAT
  // ═══════════════════════════════════════════════════════════════════════════

  openChat(chatId: string) {
    this.activeChatId = chatId;
    this.messages = [];
    this.replyingTo = null;
    this.contextMenuMsg = null;
    this.showChatSearch = false;
    this.chatSearchQuery = '';
    this.isLoading = true;

    const chatSub = this.chatService.getChatById(chatId).subscribe(chat => {
      if (!chat) return;
      this.activeChat = chat;
      this.loadPartnerProfiles(chat);
    });
    this.subs.push(chatSub);

    const msgSub = this.chatService.getMessages(chatId).subscribe(msgs => {
      this.messages = msgs.filter(m => !m.deletedFor?.includes(this.myUid));
      this.shouldScrollBottom = true;
      this.isLoading = false;
      this.cdr.detectChanges();
      const unread = msgs.filter(m => m.id && !m.readBy?.includes(this.myUid)).map(m => m.id!);
      if (unread.length) this.chatService.markAsRead(chatId, unread);
    });
    this.subs.push(msgSub);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MENÚ SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════

  toggleSidebarMenu(event: MouseEvent) {
    event.stopPropagation();
    this.showSidebarMenu = !this.showSidebarMenu;
    this.showChatMenu = false;
  }

  openNewGroup() {
    this.showSidebarMenu = false;
    this.groupStep = 1;
    this.groupName = '';
    this.selectedMembers = [];
    this.groupSearchQuery = '';
    this.groupSearchResults = [];
    this.showGroupModal = true;
    this.showNewChat = false;
  }

  markAllAsRead() {
    this.showSidebarMenu = false;
    alert('Todos los chats marcados como leídos');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MENÚ HEADER CHAT
  // ═══════════════════════════════════════════════════════════════════════════

  toggleChatMenu(event: MouseEvent) {
    event.stopPropagation();
    this.showChatMenu = !this.showChatMenu;
    this.showSidebarMenu = false;
  }

  openChatSearch() {
    this.showChatMenu = false;
    this.showChatSearch = true;
    this.chatSearchQuery = '';
    this.chatSearchResults = [];
  }

  searchInChat() {
    if (!this.chatSearchQuery.trim()) {
      this.chatSearchResults = [];
      return;
    }
    const q = this.chatSearchQuery.toLowerCase();
    this.chatSearchResults = this.messages.filter(m =>
      m.text?.toLowerCase().includes(q)
    );
    this.chatSearchIndex = 0;
    this.jumpToSearchResult(0);
  }

  jumpToSearchResult(index: number) {
    if (!this.chatSearchResults.length) return;
    this.chatSearchIndex = (index + this.chatSearchResults.length) % this.chatSearchResults.length;
    const msg = this.chatSearchResults[this.chatSearchIndex];
    const el = document.getElementById(`msg-${msg.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ─── INFO DEL CONTACTO ────────────────────────────────────────────────────
  showContactInfo = false;
  contactInfoUser: any = null;

  openContactInfo() {
    this.showChatMenu = false;
    if (!this.activeChat || this.activeChat.type !== 'dm') return;
    const otherUid = this.activeChat.members.find(u => u !== this.myUid);
    this.contactInfoUser = otherUid ? this.partnerProfiles[otherUid] : null;
    this.showContactInfo = true;
  }

  // ─── SELECCIONAR MENSAJES ─────────────────────────────────────────────────
  selectingMessages = false;
  selectedMessageIds = new Set<string>();

  toggleSelectMessages() {
    this.showChatMenu = false;
    this.selectingMessages = !this.selectingMessages;
    if (!this.selectingMessages) this.selectedMessageIds.clear();
  }

  toggleSelectMessage(msgId: string) {
    if (!this.selectingMessages) return;
    if (this.selectedMessageIds.has(msgId)) this.selectedMessageIds.delete(msgId);
    else this.selectedMessageIds.add(msgId);
  }

  async deleteSelectedMessages() {
    if (!this.activeChatId || !this.selectedMessageIds.size) return;
    for (const id of this.selectedMessageIds) {
      await this.chatService.deleteMessageForMe(this.activeChatId, id);
    }
    this.selectedMessageIds.clear();
    this.selectingMessages = false;
  }

  // ─── MENSAJES TEMPORALES ──────────────────────────────────────────────────
  showTemporalModal = false;
  temporalOptions = [
    { label: 'Desactivado', value: 0 },
    { label: '24 horas',    value: 86400 },
    { label: '7 días',      value: 604800 },
    { label: '90 días',     value: 7776000 },
  ];
  selectedTemporal = 0;

  openTemporalModal() {
    this.showChatMenu = false;
    this.selectedTemporal = (this.activeChat as any)?.temporalDuration || 0;
    this.showTemporalModal = true;
  }

  async saveTemporalMessages() {
    if (!this.activeChatId) return;
    await this.chatService.updateChatMeta(this.activeChatId, {
      temporalMessages: this.selectedTemporal > 0,
      temporalDuration: this.selectedTemporal
    });
    this.showTemporalModal = false;
  }

  // ─── FAVORITOS ────────────────────────────────────────────────────────────
  async toggleFavorite() {
    this.showChatMenu = false;
    if (!this.activeChatId || !this.activeChat) return;
    const current = (this.activeChat as any).favorite || false;
    await this.chatService.toggleFavoriteChat(this.activeChatId, current);
  }

  isFavorite(): boolean {
    return (this.activeChat as any)?.favorite || false;
  }

  // ─── AÑADIR A LISTA ───────────────────────────────────────────────────────
  showListModal = false;
  listOptions = ['Familia', 'Trabajo', 'Amigos', 'Universidad'];
  selectedList = '';

  openListModal() {
    this.showChatMenu = false;
    this.selectedList = (this.activeChat as any)?.listLabel || '';
    this.showListModal = true;
  }

  async saveList() {
    if (!this.activeChatId) return;
    await this.chatService.updateChatMeta(this.activeChatId, {
      listLabel: this.selectedList
    });
    this.showListModal = false;
  }

  // ─── VACIAR CHAT (Firestore real) ─────────────────────────────────────────
  openClearChatModal() {
    this.showChatMenu = false;
    this.showClearChatModal = true;
  }

  async clearChat() {
    if (!this.activeChatId) return;
    this.showClearChatModal = false;
    try {
      await this.chatService.clearChatForMe(this.activeChatId);
      // Los mensajes desaparecerán solos vía el observable de getMessages
    } catch (e) {
      console.error('Error vaciando chat:', e);
    }
  }

  // ─── ELIMINAR CHAT (para mí — marca deletedFor en el chat) ───────────────
  openDeleteChatModal() {
    this.showChatMenu = false;
    this.showDeleteChatModal = true;
  }

  async deleteChat() {
    if (!this.activeChatId) return;
    this.showDeleteChatModal = false;
    try {
      await this.chatService.clearChatForMe(this.activeChatId);
    } catch (e) {
      console.error('Error eliminando chat:', e);
    }
    this.activeChatId = null;
    this.activeChat = null;
    this.messages = [];
  }

  // ─── SALIR DEL GRUPO ──────────────────────────────────────────────────────
  openLeaveGroupModal() {
    this.showChatMenu = false;
    this.showLeaveGroupModal = true;
  }

  async leaveGroup() {
    if (!this.activeChatId) return;
    this.showLeaveGroupModal = false;
    try {
      await this.chatService.leaveGroup(this.activeChatId);
    } catch (e) {
      console.error('Error al salir del grupo:', e);
      return;
    }
    this.activeChatId = null;
    this.activeChat = null;
    this.messages = [];
  }

  // ─── ELIMINAR GRUPO PERMANENTEMENTE (solo admin) ─────────────────────────
  get isGroupAdmin(): boolean {
    return !!this.activeChat
      && this.activeChat.type === 'group'
      && this.activeChat.adminUid === this.myUid;
  }

  openDeleteGroupModal() {
    this.showChatMenu = false;
    this.showDeleteGroupModal = true;
  }

  async deleteGroupPermanently() {
    if (!this.activeChatId) return;
    this.showDeleteGroupModal = false;
    try {
      await this.chatService.deleteGroup(this.activeChatId);
    } catch (e) {
      console.error('Error al eliminar el grupo:', e);
      return;
    }
    this.activeChatId = null;
    this.activeChat = null;
    this.messages = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREAR GRUPO — FLUJO 2 PASOS
  // ═══════════════════════════════════════════════════════════════════════════

  async searchGroupUsers() {
    if (!this.groupSearchQuery.trim()) {
      this.groupSearchResults = [];
      return;
    }
    this.isSearchingGroupUsers = true;
    this.groupSearchResults = await this.chatService.searchUsers(this.groupSearchQuery);
    this.isSearchingGroupUsers = false;
  }

  toggleMember(user: any) {
    const idx = this.selectedMembers.findIndex(m => m.uid === user.uid);
    if (idx >= 0) this.selectedMembers.splice(idx, 1);
    else this.selectedMembers.push(user);
  }

  isMemberSelected(user: any) {
    return this.selectedMembers.some(m => m.uid === user.uid);
  }

  goToGroupStep2() {
    if (this.selectedMembers.length === 0) return;
    this.groupStep = 2;
  }

  backToGroupStep1() {
    this.groupStep = 1;
  }

  async createGroup() {
    if (!this.groupName.trim() || this.selectedMembers.length === 0) return;
    try {
      const chatId = await this.chatService.createGroup(
        this.groupName.trim(),
        this.selectedMembers.map(m => m.uid)
      );
      this.showGroupModal = false;
      this.groupName = '';
      this.selectedMembers = [];
      this.groupSearchQuery = '';
      this.groupSearchResults = [];
      this.groupStep = 1;
      await new Promise(r => setTimeout(r, 300));
      this.openChat(chatId);
    } catch (e: any) {
      console.error('Error creando grupo:', e);
    }
  }

  closeGroupModal() {
    this.showGroupModal = false;
    this.groupStep = 1;
    this.groupName = '';
    this.selectedMembers = [];
    this.groupSearchQuery = '';
    this.groupSearchResults = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIAR MENSAJE
  // ═══════════════════════════════════════════════════════════════════════════

  async sendMessage() {
    const text = this.newMessage.trim();
    if (!text || !this.activeChatId || this.isSending) return;
    this.isSending = true;

    const payload: Partial<Message> = { text, type: 'text' };

    if (this.newMessageViewOnce) {
      payload.viewOnce = true;
      payload.viewOnceData = { viewed: false, viewedBy: [] };
    }

    if (this.replyingTo) {
      payload.replyTo = {
        messageId: this.replyingTo.id!,
        text: this.replyingTo.text || '',
        senderName: this.getDisplayName(this.replyingTo.senderId)
      };
    }

    this.newMessage = '';
    this.replyingTo = null;
    this.showEmojiPicker = false;
    this.newMessageViewOnce = false;

    try {
      await this.chatService.sendMessage(this.activeChatId, payload);
      this.shouldScrollBottom = true;
    } finally {
      this.isSending = false;
      this.msgInput?.nativeElement.focus();
    }
  }

  async sendEmoji(emoji: string) {
    if (!this.activeChatId) return;
    await this.chatService.sendMessage(this.activeChatId, { text: emoji, type: 'emoji' });
    this.showEmojiPicker = false;
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADJUNTOS
  // ═══════════════════════════════════════════════════════════════════════════

  triggerImagePicker() { this.imageInput?.nativeElement.click(); this.showAttachMenu = false; }
  triggerFilePicker()  { this.fileInput?.nativeElement.click();  this.showAttachMenu = false; }

  async onImageSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.activeChatId) return;
    await this.uploadAndSend(file, 'image');
    (event.target as HTMLInputElement).value = '';
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.activeChatId) return;
    await this.uploadAndSend(file, 'file');
    (event.target as HTMLInputElement).value = '';
  }

  async onAudioFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.activeChatId) return;
    await this.uploadAndSend(file, 'audio');
    (event.target as HTMLInputElement).value = '';
  }

  async uploadAndSend(file: File, type: 'image' | 'audio' | 'file') {
    if (!this.activeChatId) return;
    this.isUploading = true;
    try {
      const result = await this.chatService.uploadFile(file, this.activeChatId, type);
      const payload: any = { type };
      if (this.newMessageViewOnce) {
        payload.viewOnce = true;
        payload.viewOnceData = { viewed: false, viewedBy: [] };
      }
      if (type === 'image') payload.imageURL = result.url;
      else if (type === 'audio') payload.audioURL = result.url;
      else { payload.fileURL = result.url; payload.fileName = result.name; payload.fileSize = result.size; }
      await this.chatService.sendMessage(this.activeChatId, payload);
      this.newMessageViewOnce = false;
      this.shouldScrollBottom = true;
    } catch (err) {
      console.error('Error uploading file:', err);
    } finally {
      this.isUploading = false;
      this.cdr.detectChanges();
    }
  }

  // ─── UBICACIÓN ────────────────────────────────────────────────────────────
  async sendLocation() {
    this.showAttachMenu = false;
    if (!navigator.geolocation || !this.activeChatId) return;
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        await this.chatService.sendMessage(this.activeChatId!, { type: 'location', location: { lat, lng } });
        this.shouldScrollBottom = true;
        this.cdr.detectChanges();
      },
      err => alert('No se pudo obtener la ubicación: ' + err.message)
    );
  }

  // ─── GIFs ─────────────────────────────────────────────────────────────────
  async searchGifs() {
    if (!this.gifSearchQuery.trim()) { await this.loadTrendingGifs(); return; }
    this.isSearchingGifs = true;
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${this.GIPHY_KEY}&q=${encodeURIComponent(this.gifSearchQuery)}&limit=20&rating=g`);
      const data = await res.json();
      this.gifResults = data.data || [];
    } catch { this.gifResults = []; }
    this.isSearchingGifs = false;
    this.cdr.detectChanges();
  }

  async loadTrendingGifs() {
    this.isSearchingGifs = true;
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${this.GIPHY_KEY}&limit=20&rating=g`);
      const data = await res.json();
      this.gifResults = data.data || [];
    } catch { this.gifResults = []; }
    this.isSearchingGifs = false;
    this.cdr.detectChanges();
  }

  async sendGif(gif: any) {
    if (!this.activeChatId) return;
    const url = gif.images?.fixed_height?.url || gif.images?.original?.url;
    await this.chatService.sendMessage(this.activeChatId, { type: 'gif', gifURL: url, text: gif.title || 'GIF' });
    this.showGifPicker = false;
    this.shouldScrollBottom = true;
  }

  async sendSticker(stickerUrl: string) {
    if (!this.activeChatId) return;
    await this.chatService.sendMessage(this.activeChatId, { type: 'sticker', stickerURL: stickerUrl });
    this.showStickerPicker = false;
    this.shouldScrollBottom = true;
  }

  openGifPicker() {
    this.showGifPicker = true;
    this.showAttachMenu = false;
    this.loadTrendingGifs();
  }

  // ─── AUDIO RECORDING ──────────────────────────────────────────────────────
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = e => this.audioChunks.push(e.data);
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingTime = 0;
      this.recordingTimer = setInterval(() => { this.recordingTime++; this.cdr.detectChanges(); }, 1000);
    } catch { alert('No se pudo acceder al micrófono'); }
  }

  async stopRecording() {
    if (!this.mediaRecorder || !this.isRecording) return;
    clearInterval(this.recordingTimer);
    this.isRecording = false;
    this.mediaRecorder.stop();
    this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    await new Promise<void>(resolve => {
      this.mediaRecorder!.onstop = async () => {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
        if (this.activeChatId) await this.uploadAndSend(file, 'audio');
        resolve();
      };
    });
  }

  cancelRecording() {
    if (this.mediaRecorder && this.isRecording) {
      clearInterval(this.recordingTimer);
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
      this.isRecording = false;
      this.audioChunks = [];
    }
  }

  formatRecordingTime(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ─── LLAMADAS WebRTC ──────────────────────────────────────────────────────
  async startCall(type: 'audio' | 'video') {
    if (!this.activeChat || !this.activeChatId) return;
    const calleeIds = this.activeChat.members.filter(u => u !== this.myUid);
    try {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      } catch (mediaErr: any) {
        if (type === 'video' && ['AbortError','NotReadableError','NotFoundError'].includes(mediaErr.name)) {
          if (!confirm('No se pudo acceder a la cámara. ¿Continuar con solo audio?')) return;
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          type = 'audio';
        } else { throw mediaErr; }
      }
      this.callId = await this.chatService.createCall(this.activeChatId, type, calleeIds);
      this.peerConnection = new RTCPeerConnection(this.rtcConfig);
      this.setupPeerConnection();
      this.localStream.getTracks().forEach(track => this.peerConnection!.addTrack(track, this.localStream!));
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await this.chatService.sendCallSignal(this.callId, { type: 'offer', sdp: offer });
      this.activeCall = { chatId: this.activeChatId, callerId: this.myUid, calleeIds, type, status: 'ringing' };
      this.listenCallSignals();
      this.startCallTimer();
      this.cdr.detectChanges();
    } catch (e: any) {
      console.error('Error iniciando llamada:', e);
      alert('No se pudo iniciar la llamada: ' + e.message);
    }
  }

  private setupPeerConnection() {
    if (!this.peerConnection) return;
    this.peerConnection.onicecandidate = event => {
      if (event.candidate && this.callId)
        this.chatService.sendCallSignal(this.callId, { type: 'ice-candidate', candidate: event.candidate.toJSON() });
    };
    this.peerConnection.ontrack = event => {
      if (this.remoteVideo?.nativeElement) this.remoteVideo.nativeElement.srcObject = event.streams[0];
      this.cdr.detectChanges();
    };
    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection?.connectionState === 'connected') {
        if (this.activeCall) this.activeCall.status = 'active';
        this.cdr.detectChanges();
      }
    };
  }

  private listenCallSignals() {
    if (!this.callId) return;
    this.signalSub = this.chatService.getCallSignals(this.callId).subscribe(async signals => {
      for (const signal of signals) {
        if (this.processedSignals.has(signal.id) || signal.from === this.myUid) continue;
        this.processedSignals.add(signal.id);
        if (signal.type === 'answer' && this.peerConnection)
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        else if (signal.type === 'ice-candidate' && this.peerConnection)
          try { await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch {}
        else if (signal.type === 'offer' && this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          await this.chatService.sendCallSignal(this.callId!, { type: 'answer', sdp: answer });
        } else if (signal.type === 'end') { this.endCall(true); }
      }
    });
  }

  async answerCall(callId: string, type: 'audio' | 'video') {
    this.callId = callId;
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    this.setupPeerConnection();
    this.localStream.getTracks().forEach(track => this.peerConnection!.addTrack(track, this.localStream!));
    this.listenCallSignals();
    await this.chatService.updateCallStatus(callId, 'active');
    this.startCallTimer();
  }

  async endCall(silent = false) {
    clearInterval(this.callTimer);
    this.callDuration = 0;
    if (this.callId && !silent) {
      await this.chatService.sendCallSignal(this.callId, { type: 'end' });
      await this.chatService.updateCallStatus(this.callId, 'ended');
    }
    this.peerConnection?.close();
    this.peerConnection = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.signalSub?.unsubscribe();
    this.processedSignals.clear();
    this.activeCall = null;
    this.callId = null;
    this.isCallMinimized = false;
    this.cdr.detectChanges();
  }

  private startCallTimer() {
    this.callDuration = 0;
    this.callTimer = setInterval(() => { this.callDuration++; this.cdr.detectChanges(); }, 1000);
  }

  formatCallDuration(): string { return this.formatRecordingTime(this.callDuration); }

  toggleMicrophone() { this.localStream?.getAudioTracks().forEach(t => t.enabled = !t.enabled); }
  toggleCamera()     { this.localStream?.getVideoTracks().forEach(t => t.enabled = !t.enabled); }
  isMicEnabled(): boolean    { return this.localStream?.getAudioTracks()[0]?.enabled ?? true; }
  isCameraEnabled(): boolean { return this.localStream?.getVideoTracks()[0]?.enabled ?? true; }

  // ─── CONTEXT MENU ─────────────────────────────────────────────────────────
  openContextMenu(event: MouseEvent, msg: Message) {
    event.preventDefault();
    if (msg.deletedForAll) return;
    this.contextMenuMsg = msg;
    const menuW = 200, menuH = 280;
    this.contextMenuX = Math.min(event.clientX, window.innerWidth - menuW);
    this.contextMenuY = Math.min(event.clientY, window.innerHeight - menuH);
  }

  closeContextMenu() { this.contextMenuMsg = null; }

  replyTo(msg: Message) {
    this.replyingTo = msg;
    this.closeContextMenu();
    this.msgInput?.nativeElement.focus();
  }

  startEdit(msg: Message) {
    this.editingMessageId = msg.id!;
    this.editingText = msg.text || '';
    this.closeContextMenu();
  }

  async saveEdit() {
    if (!this.activeChatId || !this.editingMessageId) return;
    await this.chatService.editMessage(this.activeChatId, this.editingMessageId, this.editingText);
    this.editingMessageId = null;
    this.editingText = '';
  }

  cancelEdit() { this.editingMessageId = null; }

  // ─── BORRAR MENSAJE ───────────────────────────────────────────────────────
  openDeleteModal(msg: Message) {
    this.deleteTargetMsg = msg;
    this.showDeleteModal = true;
    this.closeContextMenu();
  }

  async deleteForMe() {
    if (!this.activeChatId || !this.deleteTargetMsg?.id) return;
    await this.chatService.deleteMessageForMe(this.activeChatId, this.deleteTargetMsg.id);
    this.showDeleteModal = false;
    this.deleteTargetMsg = null;
  }

  async deleteForAll() {
    if (!this.activeChatId || !this.deleteTargetMsg?.id) return;
    await this.chatService.deleteMessageForAll(this.activeChatId, this.deleteTargetMsg.id);
    this.showDeleteModal = false;
    this.deleteTargetMsg = null;
  }

  async deleteMsg(msg: Message) { this.openDeleteModal(msg); }

  async react(msg: Message, emoji: string) {
    if (!this.activeChatId || !msg.id) return;
    await this.chatService.reactToMessage(this.activeChatId, msg.id, emoji);
    this.closeContextMenu();
  }

  // ─── VIEW ONCE ────────────────────────────────────────────────────────────
  isViewOnceViewed(msg: Message): boolean {
    if (!msg.viewOnce) return false;
    return !!(msg.viewOnceData?.viewed || msg.viewOnceData?.viewedBy?.includes(this.myUid));
  }

  async openViewOnceMedia(msg: Message) {
    if (!msg.id || !this.activeChatId) return;
    if (msg.senderId !== this.myUid && !this.isViewOnceViewed(msg)) {
      this.viewOnceTargetMsg = msg;
      this.showViewOnceModal = true;
      await this.chatService.markViewOnceViewed(this.activeChatId, msg.id);
    } else if (msg.senderId === this.myUid) {
      this.viewOnceTargetMsg = msg;
      this.showViewOnceModal = true;
    }
  }

  // ─── NUEVO CHAT (DM) ──────────────────────────────────────────────────────
  async searchUsers() {
    if (!this.userSearchQuery.trim()) { this.userSearchResults = []; return; }
    this.isSearchingUsers = true;
    this.userSearchResults = await this.chatService.searchUsers(this.userSearchQuery);
    this.isSearchingUsers = false;
  }

  async startDM(user: any) {
    try {
      const chatId = await this.chatService.getOrCreateDM(user.uid);
      this.showNewChat = false;
      this.userSearchQuery = '';
      this.userSearchResults = [];
      await new Promise(r => setTimeout(r, 300));
      this.openChat(chatId);
    } catch (e: any) { console.error('Error creando DM:', e); }
  }

  async startDMWithUser(uid: string) {
    const chatId = await this.chatService.getOrCreateDM(uid);
    this.openChat(chatId);
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  getChatName(chat: Chat): string {
    if (chat.type === 'group') return chat.groupName || 'Grupo';
    const otherUid = chat.members.find(u => u !== this.myUid);
    return otherUid ? (this.partnerProfiles[otherUid]?.displayName || 'Usuario') : 'Chat';
  }

  getChatPhoto(chat: Chat): string {
    if (chat.type === 'group') return chat.groupPhoto || '';
    const otherUid = chat.members.find(u => u !== this.myUid);
    return otherUid ? (this.partnerProfiles[otherUid]?.photoURL || '') : '';
  }

  getDisplayName(uid: string): string {
    if (uid === this.myUid) return 'Tú';
    return this.partnerProfiles[uid]?.displayName || 'Usuario';
  }

  isMine(msg: Message): boolean { return msg.senderId === this.myUid; }

  isRead(msg: Message): boolean {
    if (!this.activeChat) return false;
    const others = this.activeChat.members.filter(u => u !== this.myUid);
    return others.every(uid => msg.readBy?.includes(uid));
  }

  getReactionEntries(reactions?: { [k: string]: string[] }) {
    if (!reactions) return [];
    return Object.entries(reactions).map(([emoji, uids]) => ({ emoji, count: uids.length }));
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatTime(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  }

  shouldShowDate(index: number): boolean {
    if (index === 0) return true;
    const prev = this.messages[index - 1], curr = this.messages[index];
    if (!prev.createdAt || !curr.createdAt) return false;
    const pd = prev.createdAt.toDate ? prev.createdAt.toDate() : new Date(prev.createdAt);
    const cd = curr.createdAt.toDate ? curr.createdAt.toDate() : new Date(curr.createdAt);
    return pd.toDateString() !== cd.toDateString();
  }

  shouldShowAvatar(index: number): boolean {
    if (index === this.messages.length - 1) return true;
    return this.messages[index].senderId !== this.messages[index + 1].senderId;
  }

  getMapUrl(lat: number, lng: number): string {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=280x150&markers=color:red%7C${lat},${lng}&key=YOUR_MAPS_KEY`;
  }

  getLocationLink(lat: number, lng: number): string {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  private scrollToBottom() {
    try { this.messagesEnd?.nativeElement.scrollIntoView({ behavior: 'smooth' }); } catch {}
  }

  closeAllPanels() {
    this.showEmojiPicker = false;
    this.showAttachMenu = false;
    this.showGifPicker = false;
    this.showStickerPicker = false;
    this.closeContextMenu();
  }

  listenIncomingCalls() {
    const sub = this.chatService.getIncomingCalls().subscribe(calls => {
      if (!calls.length) return;
      const call = calls[0];
      if (this.activeCall || this.callId === call.id) return;
      const accept = confirm(`Llamada entrante ${call.type === 'video' ? 'de video' : 'de audio'}`);
      if (accept) {
        this.activeCall = call;
        this.answerCall(call.id!, call.type);
      } else {
        this.chatService.updateCallStatus(call.id!, 'ended');
      }
    });
    this.subs.push(sub);
  }
}