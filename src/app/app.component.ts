import { Component, ElementRef, NgZone, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import OpenAI from 'openai';

import { ISelectedProduct, MeasureUnits } from './app-model';
import { products } from './product-list';
import audioBufferToWav from 'audiobuffer-to-wav';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  private readonly useAzureAI: boolean = true;

  file: any;
  recorderRef!: HTMLAudioElement;
  playerRef!: HTMLAudioElement;
  isRecording = false;
  chunks: any[] = [];
  mediaRecorder!: MediaRecorder;
  stream!: MediaStream | null;
  recordedAudioBlob!: Blob;

  @ViewChild('recorder', { read: ElementRef })
  set recorder(element: ElementRef) {
    this.recorderRef = element?.nativeElement;
  }
  @ViewChild('player', { read: ElementRef })
  set player(element: ElementRef) {
    this.playerRef = element?.nativeElement;
  }

  openai!: OpenAI;

  selectedProducts: ISelectedProduct[] = [];
  totalProducts = products;

  transcription: string | undefined;
  lastTranscription: string | undefined;
  processing = false;

  get allProductsList() {
    return this.totalProducts && this.totalProducts.map(p => p.name);
  }

  get isClearBtnDisabled(): boolean {
    // return !this.recordedAudioBlob || this.isRecording;
    return (!this.chunks || this.chunks.length == 0) || this.isRecording;
  }

  get isTranscribeBtnDisabled(): boolean {
    // return !this.recordedAudioBlob || this.isRecording;
    return (!this.chunks || this.chunks.length == 0) || this.isRecording;
  }

  get isCompletionBtnDisabled(): boolean {
    return !this.transcription;
  }

  get useOpenAI(): boolean {
    return !this.useAzureAI;
  }

  constructor(private http: HttpClient, private ngZone: NgZone) {
    if (this.useOpenAI) {
      import('src/assets/api-key').then(m => {
        this.openai = new OpenAI({
          apiKey: m.getApiKey().split('@$!;').join(''), // Using split to avoid API key leak on hosting app.
          dangerouslyAllowBrowser: true
        });
      });
    }
  }

  ngOnInit(): void {
  }

  //#region  Media related methods

  startRecording() {
    if (this.isRecording) {
      return;
    }
    this.isRecording = true;

    if (this.playerRef) {
      this.playerRef.src = '';
    }

    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((mediaStreamObj: MediaStream) => {
      this.record(mediaStreamObj);
    }).catch((err) => {
      console.error(err.name, err.message);
    });
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }
    this.isRecording = false;

    if (this.recorderRef) {
      this.recorderRef.pause();
    }

    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }

    setTimeout(() => {
      if (this.recordedAudioBlob) {
        this.file = new File([this.recordedAudioBlob], 'audio.wav', {
          type: this.recordedAudioBlob.type,
        });
      }
    }, 0);
  }

  clearRecording() {
    this.chunks = [];
    if (this.playerRef) {
      this.playerRef.src = '';
    }

    this.stream?.getAudioTracks().forEach(track => track.stop());
    this.stream = null;
  }

  private record(stream: MediaStream) {
    this.stream = stream;
    this.stream.addEventListener('oninactive', () => {
      console.log("Stream ended!")
    });

    if (this.recorderRef) {
      this.recorderRef.srcObject = stream;
    }

    this.mediaRecorder = new MediaRecorder(stream);

    this.mediaRecorder.ondataavailable = (ev) => {
      this.chunks.push(ev.data);
    }

    // Convert the audio data in to blob
    // after stopping the recording
    this.mediaRecorder.onstop = async (ev) => await this.onMediaRecorderStop(ev);

    this.mediaRecorder.start();
  }

  private async onMediaRecorderStop(ev: any) {

    // blob of type mp3
    // this.recordedAudioBlob = new Blob(this.chunks, { 'type': 'audio/mp3;' });
    // this.recordedAudioBlob = new Blob(this.chunks, { 'type': 'audio/wav;' });

    const audioBlob = new Blob(this.chunks, { 'type': 'audio/wav;' });
    const recordedAudio = await this.convertTo16kHz16bitMonoPCM(audioBlob);
    this.ngZone.run(_ => {
      this.recordedAudioBlob = recordedAudio;
    });

    this.chunks = [];

    // Creating audio url with reference
    // of created blob named 'audioData'
    // let audioSrc = window.URL.createObjectURL(this.recordedAudioBlob);
    let audioSrc = window.URL.createObjectURL(audioBlob);

    // Pass the audio url to the 2nd video tag
    if (this.playerRef) {
      this.playerRef.src = audioSrc;
    }

    this.stream?.getAudioTracks().forEach(track => track.stop());
    this.stream = null;
  }
  
  private trimAudioBuffer(buffer: AudioBuffer): AudioBuffer {
    const rawData = buffer.getChannelData(0);
    const threshold = 0.025; // Adjust as needed
    let startOffset = 0;
    let endOffset = rawData.length - 1;

    // Find the first non-silent sample
    while (Math.abs(rawData[startOffset]) < threshold && startOffset < rawData.length) {
      startOffset++;
    }

    // Find the last non-silent sample
    while (Math.abs(rawData[endOffset]) < threshold && endOffset >= 0) {
      endOffset--;
    }

    // Calculate the length of the trimmed buffer
    const trimmedLength = endOffset - startOffset + 1;

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const trimmedBuffer = audioCtx.createBuffer(
      buffer.numberOfChannels,
      trimmedLength,
      buffer.sampleRate
    );

    // Copy the non-silent samples to the new buffer
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      const trimmedChannelData = trimmedBuffer.getChannelData(channel);
      for (let i = 0; i < trimmedLength; i++) {
        trimmedChannelData[i] = channelData[startOffset + i];
      }
    }

    return trimmedBuffer;
  }

  private convertTo16kHz16bitMonoPCM(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtx.decodeAudioData(arrayBuffer, async (audioBuffer) => {
          // Trim the audio buffer to remove trailing silence
          const trimmedBuffer = this.trimAudioBuffer(audioBuffer);

          const offlineCtx = new OfflineAudioContext(1, trimmedBuffer.length, 16000);
          const source = offlineCtx.createBufferSource();
          source.buffer = trimmedBuffer;
          source.connect(offlineCtx.destination);
          source.start(0);
          offlineCtx.oncomplete = (e) => {
            const renderedBuffer = e.renderedBuffer;
            const wavBuffer = audioBufferToWav(renderedBuffer);
            resolve(new Blob([wavBuffer], { type: 'audio/wav' }));
          };
          // offlineCtx.startRendering().then((renderedBuffer) => {
          //   const wavBuffer = this.audioToWav(renderedBuffer);
          //   resolve(new Blob([wavBuffer], { type: 'audio/wav' }));
          // });
          await offlineCtx.startRendering();
        }, reject);
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  // Function to convert audio buffer to WAV format
  private audioToWav(buffer: AudioBuffer): ArrayBuffer {
    // Code to convert AudioBuffer to WAV format (16kHz, 16-bit, mono PCM)
    const wavBuffer = audioBufferToWav(buffer);
    return wavBuffer;
  }
  
  // When using file upload control in html.
  handleFileUpload(ev: any) {
    this.lastTranscription = this.transcription;
    this.transcription = '';
    this.file = ev.dataTransfer ? ev.dataTransfer.files[0] : ev.target.files[0];
  }

  //#endregion

  //#region AI Operations
  transcribeAudio() {
    if (this.useAzureAI) {
      this.azTranscribeAudio();
    } else {
      this.openAITranscribeAudio();
    }
  }
  completionProcess() {
    if (this.useAzureAI) {
      this.azCompletionProcess();
    } else {
      this.openAICompletionProcess();
    }
  }
  //#endregion

  //#region Azure AI Service Operations
  private azTranscribeAudio() {
    this.processing = true;
    this.lastTranscription = this.transcription || this.lastTranscription;
    this.transcription = '';
    const formData = new FormData();
    formData.append("formFile", this.recordedAudioBlob, 'audio.wav');

    this.http.post('api/AzureAI/GetText', formData).subscribe({
      next: (data: any) => {
        this.processing = false;
        this.transcription = data.text;
        this.clearRecording();
      },
      error: err => {
        console.error(err);
        this.processing = false;
      }
    });
  }
  private azCompletionProcess() {
    this.processing = true;
    this.http.post('api/AzureAI/ProcessTranscript/', {promptMessage: this.transcription}).subscribe({
      next: (data: any) => {
        if (data.status == 'success' && data.tools instanceof Array) {
          (data.tools as Array<{process: string, args: string}>).forEach(t => {
            let args = null;
            try {
              if (t.args) {
                args = JSON.parse(t.args);
              }
            }
            catch {}
  
            if (args && t.process) {
              this.initiateCartOperation(t.process, args);
            }            
          })

          console.log(data);
        } else {
          alert('Can you please provide more information or clarify your request?');
        }

        this.processing = false;
        this.lastTranscription = this.transcription || this.lastTranscription;
        // this.transcription = '';
      },
      error: err => {
        this.processing = false;
        console.error(err);
        alert(`There was an error on completions API.`);
      }
    });    
  }
  //#endregion

  //#region Open AI Operations
  private openAIFunctions = [
    {
      "name": "addProduct",
      "description": "Add given product to the cart from the list of available products.",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of the product to add to the cart. Choose from the given list of products.",
            "enum": this.totalProducts.map(p => p.name)
          },
          "quantity": {
            "type": "number",
            "description": "The quantity of the product to add."
          }
        },
        "required": ["name", "quantity"]
      }
    },
    {
      "name": "removeProduct",
      "description": "Remove a product in the cart.",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of the product to remove from the cart.",
            "enum": this.totalProducts.map(p => p.name)
          },
        },
        "required": ["name"]
      }
    },
    {
      "name": "updateQuantity",
      "description": "Update the quantity of the product which is already added in the cart.",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of the product to update from the cart.",
            "enum": this.totalProducts.map(p => p.name)
          },
          "quantity": {
            "type": "number",
            "description": "The quantity of the product to update."
          }
        },
        "required": ["name", "quantity"]
      }
    },
    {
      "name": "clearCart",
      "description": "Clear and remove all the items in the cart.",
      "parameters": {
        "type": "object",
        "properties": {}
      }
    }
  ]  

  openAITranscribeAudio() {
    this.processing = true;
    this.lastTranscription = this.transcription || this.lastTranscription;
    this.transcription = '';
    this.openai.audio.transcriptions.create({
      file: this.file,
      model: "whisper-1",
    }).then(value => {
      this.transcription = value.text;
      this.processing = false;
      this.clearRecording();
    }, err => {
      this.processing = false;
      console.error(err);
    });
  }

  openAICompletionProcess() {
    const messages = [{ role: "user", content: `Call a required function from this prompt:: ${this.transcription}` }] as any;
    this.lastTranscription = this.transcription || this.lastTranscription;
    this.transcription = '';
    this.processing = true;
    this.openai.chat.completions.create({
      messages: messages,
      model: "gpt-3.5-turbo-0613",
      functions: this.openAIFunctions,
      function_call: "auto"
    }).then((response: any) => {
      this.processing = false;
      const responseMessage = response["choices"][0]["message"];
      if (responseMessage.function_call) {
        let funcArgs = {} as any;
        try {
          funcArgs = JSON.parse(responseMessage.function_call.arguments);
        }
        catch {
        }

        this.initiateCartOperation(responseMessage.function_call.name, funcArgs);

      } else {
        alert('Can you please provide more information or clarify your request?');
        console.error(responseMessage.content);
      }

    }, err => {
      this.processing = false;
      alert(`There was an error on completions API.`);
    });
  }
  //#endregion

  //#region Cart related methods
  private addProduct(name: string, quantity: number, unit?: string) {
    const selectedProduct = this.totalProducts.find(p => p.name.toLowerCase() == name.trim().toLowerCase());
    if (selectedProduct) {
      if (this.selectedProducts.find(p => p.name.toLowerCase() == selectedProduct.name.trim().toLowerCase())) {
        this.updateQuantity(name, quantity);
      } else {
        this.selectedProducts.push({
          id: selectedProduct.id,
          name: selectedProduct.name,
          quantity: quantity,
          unit: unit
        });
      }
    } else {
      alert(`We do not have ${name}`);
    }
  }

  private removeProduct(name: string) {
    if (this.selectedProducts.some((s: ISelectedProduct) => s.name.toLowerCase() == name.trim().toLowerCase())) {
      this.selectedProducts = this.selectedProducts.filter((s: ISelectedProduct) => s.name.toLowerCase() != name.trim().toLowerCase());
    } else {
      alert(`${name} is not present in the cart.`);
    }
  }

  private updateQuantity(name: string, quantity: number) {
    const product = this.selectedProducts.find(p => p.name.toLowerCase() == name.trim().toLowerCase());
    if (product) {
      product.quantity = quantity;
    } else {
      alert(`${name} is not present in the cart.`);
    }
  }

  private clearCart() {
    this.selectedProducts = [];
  }

  private initiateCartOperation(name: string, args: any) {
    switch (name) {
      case "addProduct":
        this.addProduct(args.name, args.quantity, args.unit);
        break;
      case "removeProduct":
        this.removeProduct(args.name);
        break;
      case "updateQuantity":
        this.updateQuantity(args.name, args.quantity);
        break;
      case "clearCart":
        this.clearCart();
        break;
      default:
        alert(`There is no function to call with name: ${name}`);
        break;
    }
  }

  //#endregion

}
