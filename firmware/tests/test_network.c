#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
typedef struct {int unused;} fd_set;
#define FD_ZERO(p) ((void)(p))
#define FD_SET(n,p) ((void)(n),(void)(p))
static int64_t elapsed;
static int chunk=1,step=1,ready=1,reads,writes;
static int64_t now_ms(void){return elapsed;}
static int select(int n,fd_set *r,fd_set *w,fd_set *e,struct timeval *wait){
    (void)n;(void)e;assert((r!=NULL)!=(w!=NULL));assert(wait->tv_sec*1000+wait->tv_usec/1000>0);return ready;
}
static int recv(int sock,void *data,size_t length,int flags){
    (void)sock;(void)data;(void)flags;reads++;elapsed+=step;return chunk<=0?chunk:(int)(length<(size_t)chunk?length:(size_t)chunk);
}
static int send(int sock,const void *data,size_t length,int flags){writes++;return recv(sock,(void*)data,length,flags);}
#include "bounded_socket.inc"
int main(void){
    uint8_t data[64];
    assert(socket_exact(1,data,10,false,20));assert(reads==10&&elapsed==10);
    /* Slow fragments cannot keep a request alive by resetting a socket timeout. */
    elapsed=0;reads=0;step=5;assert(!socket_exact(1,data,64,false,20));assert(reads==4&&elapsed==20);
    /* Header and body share the same transaction deadline. */
    elapsed=0;reads=0;step=1;assert(socket_exact(1,data,12,true,20));
    assert(!socket_exact(1,data,9,false,20));assert(elapsed==20&&writes==12);
    elapsed=0;reads=0;ready=0;assert(!socket_exact(1,data,9,false,20));assert(reads==0);
    ready=1;chunk=0;assert(!socket_exact(1,data,9,false,20));
    chunk=-1;assert(!socket_exact(1,data,9,false,20));
    chunk=64;elapsed=0;assert(socket_exact(1,data,64,false,20));
    puts("PASS: fragmented Modbus frames, shared deadlines, slow peers, timeout and closed sockets");return 0;
}
